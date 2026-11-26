import { beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { Aggregator, Query } from "mingo";
import "mingo/init/system";
import {
  approvalChangeAfterEdit,
  countPendingApprovals,
  parseApprovalRequest,
  parseBulkReviewRequest,
  parseEditRevision,
  reopenExpense,
  resubmitExpense,
  reviewExpense,
  reviewExpenses,
  staleEditConflict,
} from "./approval-server";
import type { AuthUser } from "@/lib/auth";
import { EDIT_RESUBMIT_NOTE, MAX_BULK_REVIEW, PENDING_MATCH } from "@/lib/approval";
import Asset from "@/models/Asset";
import Expense from "@/models/Expense";

vi.mock("@/models/Expense", () => ({
  default: { findOneAndUpdate: vi.fn(), findById: vi.fn(), aggregate: vi.fn() },
}));
vi.mock("@/models/Asset", () => ({ default: { exists: vi.fn() } }));
vi.mock("@/models/User", () => ({ default: {} }));
vi.mock("@/lib/trip-query", () => ({
  populateExpenseRefs: (query: unknown) => query,
  withLinkedAssetCounts: async (rows: Record<string, unknown>[]) =>
    rows.map((row) => ({ ...row, linkedAssetCount: 0 })),
}));

const ADMIN: AuthUser = { _id: "66c1884c0853f8a76a4da001", email: "a@x.com", name: "Priya", role: "admin" };
const MASTER: AuthUser = { _id: "66c1884c0853f8a76a4da002", email: "m@x.com", name: "Mo", role: "master_admin" };
const OWNER: AuthUser = { _id: "66c1884c0853f8a76a4da101", email: "o@x.com", name: "Asha", role: "user" };
const OTHER: AuthUser = { _id: "66c1884c0853f8a76a4da102", email: "r@x.com", name: "Ravi", role: "user" };
/** An admin who was a `user` when they submitted expenses of their own. */
const PROMOTED: AuthUser = { ...OWNER, role: "admin" };
const NOW = new Date("2026-11-20T10:00:00.000Z");

const ID = "66c1884c0853f8a76a4da201";
const ID2 = "66c1884c0853f8a76a4da202";
const ID3 = "66c1884c0853f8a76a4da203";

type Doc = Record<string, unknown>;
let store: Doc[];
/** Assets, by the expense they were bought through. */
let assets: { purchaseExpense: string }[];

/** Applies the update operators these writes use, like MongoDB would. */
function applyUpdate(doc: Doc, update: { $set?: Doc; $push?: Doc; $inc?: Record<string, number> }) {
  Object.assign(doc, update.$set ?? {});
  for (const [key, value] of Object.entries(update.$push ?? {})) {
    doc[key] = [...((doc[key] as unknown[]) ?? []), value];
  }
  for (const [key, value] of Object.entries(update.$inc ?? {})) {
    doc[key] = Number(doc[key] ?? 0) + value;
  }
}

function chain(result: () => unknown) {
  const query = {
    populate: vi.fn(() => query),
    select: vi.fn(() => query),
    lean: vi.fn(() => Promise.resolve(result())),
  };
  return query;
}

beforeEach(() => {
  vi.clearAllMocks();
  store = [];
  assets = [];
  vi.mocked(Asset.exists).mockImplementation(((filter: Doc) =>
    Promise.resolve(
      assets.some((asset) => asset.purchaseExpense === filter.purchaseExpense) ? { _id: "asset" } : null
    )) as never);
  // An atomic conditional update over the in-memory store.
  vi.mocked(Expense.findOneAndUpdate).mockImplementation(((filter: Doc, update: never) =>
    chain(() => {
      const doc = store.find((candidate) => new Query(filter).test(candidate));
      if (!doc) return null;
      applyUpdate(doc, update);
      return structuredClone(doc);
    })) as never);
  vi.mocked(Expense.findById).mockImplementation(((id: string) =>
    chain(() => {
      const doc = store.find((candidate) => candidate._id === id);
      return doc ? structuredClone(doc) : null;
    })) as never);
  vi.mocked(Expense.aggregate).mockImplementation(((pipeline: never[]) =>
    Promise.resolve(new Aggregator(pipeline).run(store))) as never);
});

function addExpense(overrides: Doc = {}): Doc {
  const doc: Doc = {
    _id: ID,
    title: "Taxi",
    amount: 450,
    amountInBaseCurrency: 450,
    createdBy: OWNER._id,
    approvalStatus: "pending",
    assetAllocationRevision: 3,
    approvalHistory: [{ action: "submitted", by: OWNER._id, at: NOW, note: null }],
    createdAt: NOW,
    ...overrides,
  };
  store.push(doc);
  return doc;
}

describe("reviewExpense", () => {
  it("approves with one conditional update on the pending status and the revision", async () => {
    addExpense();

    const outcome = await reviewExpense({ id: ID, action: "approve", revision: 3, reviewer: ADMIN, now: NOW });

    expect(Expense.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(Expense.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: ID, approvalStatus: "pending", createdBy: { $ne: ADMIN._id }, assetAllocationRevision: 3 },
      {
        $set: { approvalStatus: "approved", reviewedBy: ADMIN._id, reviewedAt: NOW, rejectionReason: null },
        $push: { approvalHistory: { action: "approved", by: ADMIN._id, at: NOW, note: null } },
        $inc: { assetAllocationRevision: 1 },
      },
      { new: true }
    );
    expect(outcome).toEqual({
      ok: true,
      expense: expect.objectContaining({ approvalStatus: "approved", assetAllocationRevision: 4, linkedAssetCount: 0 }),
    });
    const query = vi.mocked(Expense.findOneAndUpdate).mock.results[0].value;
    // The reviewer comes from populateExpenseRefs (mocked here); only the history is added.
    expect(query.populate).toHaveBeenCalledTimes(1);
    expect(query.populate).toHaveBeenCalledWith("approvalHistory.by", "name email");
  });

  it("rejects with the trimmed reason on the expense and in its history", async () => {
    addExpense();

    const outcome = await reviewExpense({
      id: ID,
      action: "reject",
      revision: 3,
      reason: "  Receipt missing  ",
      reviewer: MASTER,
      now: NOW,
    });

    expect(outcome.ok).toBe(true);
    expect(store[0]).toEqual(
      expect.objectContaining({
        approvalStatus: "rejected",
        reviewedBy: MASTER._id,
        reviewedAt: NOW,
        rejectionReason: "Receipt missing",
        assetAllocationRevision: 4,
      })
    );
    expect((store[0].approvalHistory as Doc[]).at(-1)).toEqual({
      action: "rejected",
      by: MASTER._id,
      at: NOW,
      note: "Receipt missing",
    });
  });

  it("needs a reason to reject and an admin to review", async () => {
    addExpense();

    await expect(
      reviewExpense({ id: ID, action: "reject", revision: 3, reason: " ", reviewer: ADMIN })
    ).rejects.toThrow("Add a reason so the submitter knows what to fix");
    await expect(reviewExpense({ id: ID, action: "approve", revision: 3, reviewer: OWNER })).rejects.toThrow(
      "Only admins can approve or reject expenses"
    );
    expect(Expense.findOneAndUpdate).not.toHaveBeenCalled();
    expect(store[0].approvalStatus).toBe("pending");
  });

  it("matches revision 0 on documents that predate the revision field", async () => {
    addExpense({ assetAllocationRevision: undefined });
    delete store[0].assetAllocationRevision;

    const outcome = await reviewExpense({ id: ID, action: "approve", revision: 0, reviewer: ADMIN });

    expect(outcome.ok).toBe(true);
    expect(store[0].assetAllocationRevision).toBe(1);
  });

  it("reports an expense that no longer exists", async () => {
    const outcome = await reviewExpense({ id: ID, action: "approve", revision: 3, reviewer: ADMIN });

    expect(outcome).toEqual({
      ok: false,
      status: 404,
      code: "not_found",
      error: "This expense no longer exists. It may have been deleted.",
    });
  });

  it("reports an expense another admin already decided, with its status", async () => {
    addExpense({ approvalStatus: "rejected", assetAllocationRevision: 4 });

    const outcome = await reviewExpense({ id: ID, action: "approve", revision: 3, reviewer: ADMIN });

    expect(outcome).toEqual({
      ok: false,
      status: 409,
      code: "not_pending",
      error: "This expense was already rejected.",
      approvalStatus: "rejected",
    });
  });

  it("treats a legacy expense without a status as already approved", async () => {
    addExpense({ approvalStatus: undefined });
    delete store[0].approvalStatus;

    const outcome = await reviewExpense({ id: ID, action: "reject", revision: 3, reason: "Duplicate", reviewer: ADMIN });

    expect(outcome).toEqual(
      expect.objectContaining({ ok: false, code: "not_pending", approvalStatus: "approved" })
    );
    expect(store[0].approvalStatus).toBeUndefined();
  });

  it("refuses a decision on a version the reviewer didn't see", async () => {
    // The submitter edited it after the admin opened it.
    addExpense({ assetAllocationRevision: 5 });

    const outcome = await reviewExpense({ id: ID, action: "approve", revision: 3, reviewer: ADMIN });

    expect(outcome).toEqual({
      ok: false,
      status: 409,
      code: "stale",
      error: "This expense changed after you opened it. Review the latest version.",
      approvalStatus: "pending",
    });
    expect(store[0].approvalStatus).toBe("pending");
  });

  it("never lets an admin decide their own expense, whatever its revision", async () => {
    addExpense();

    for (const action of ["approve", "reject"] as const) {
      const outcome = await reviewExpense({ id: ID, action, revision: 3, reason: "Looks wrong", reviewer: PROMOTED });
      expect(outcome).toEqual({
        ok: false,
        status: 403,
        code: "own_expense",
        error: "You can't review your own expense. Another admin needs to approve or reject it.",
      });
    }
    // The rule is in the filter itself, not just checked beforehand.
    expect(vi.mocked(Expense.findOneAndUpdate).mock.calls[0][0]).toEqual(
      expect.objectContaining({ createdBy: { $ne: PROMOTED._id } })
    );
    expect(store[0]).toEqual(expect.objectContaining({ approvalStatus: "pending", assetAllocationRevision: 3 }));
  });

  it("lets only one of two admins deciding at the same time win", async () => {
    addExpense();

    const [first, second] = await Promise.all([
      reviewExpense({ id: ID, action: "approve", revision: 3, reviewer: ADMIN }),
      reviewExpense({ id: ID, action: "reject", revision: 3, reason: "Not a business expense", reviewer: MASTER }),
    ]);

    expect(first.ok).toBe(true);
    expect(second).toEqual(expect.objectContaining({ ok: false, code: "not_pending", approvalStatus: "approved" }));
    expect(store[0].approvalStatus).toBe("approved");
    expect(store[0].rejectionReason).toBeNull();
    expect(store[0].approvalHistory).toHaveLength(2);
    expect(store[0].assetAllocationRevision).toBe(4);
  });
});

describe("reviewExpenses", () => {
  it("decides each expense on its own and reports which failed, in request order", async () => {
    addExpense({ _id: ID });
    addExpense({ _id: ID2, approvalStatus: "approved" });
    addExpense({ _id: ID3, assetAllocationRevision: 7 });

    const result = await reviewExpenses({
      action: "reject",
      items: [
        { id: ID, revision: 3 },
        { id: ID2, revision: 3 },
        { id: ID3, revision: 3 },
      ],
      reason: "Duplicate",
      reviewer: ADMIN,
      now: NOW,
    });

    expect(result.done).toEqual([ID]);
    expect(result.failed).toEqual([
      { id: ID2, code: "not_pending", error: "This expense was already approved." },
      {
        id: ID3,
        code: "stale",
        error: "This expense changed after you opened it. Review the latest version.",
      },
    ]);
    expect(result.reviewed).toEqual([expect.objectContaining({ _id: ID, approvalStatus: "rejected" })]);
    expect(store.map((doc) => doc.approvalStatus)).toEqual(["rejected", "approved", "pending"]);
    expect(store[0].rejectionReason).toBe("Duplicate");
  });

  it("skips the reviewer's own expenses with their own code and decides the rest", async () => {
    addExpense({ _id: ID });
    addExpense({ _id: ID2, createdBy: PROMOTED._id });

    const result = await reviewExpenses({
      action: "approve",
      items: [
        { id: ID, revision: 3 },
        { id: ID2, revision: 3 },
      ],
      reviewer: PROMOTED,
    });

    expect(result.done).toEqual([]);
    // ID belongs to OWNER, who is PROMOTED; both are this reviewer's own.
    expect(result.failed.map((item) => item.code)).toEqual(["own_expense", "own_expense"]);

    const byAnother = await reviewExpenses({
      action: "approve",
      items: [
        { id: ID, revision: 3 },
        { id: ID2, revision: 3 },
      ],
      reviewer: ADMIN,
    });
    expect(byAnother.done).toEqual([ID, ID2]);
  });

  it("reports deleted expenses as not found", async () => {
    const result = await reviewExpenses({ action: "approve", items: [{ id: ID, revision: 0 }], reviewer: ADMIN });

    expect(result).toEqual({
      done: [],
      failed: [{ id: ID, code: "not_found", error: "This expense no longer exists. It may have been deleted." }],
      reviewed: [],
    });
  });

  it("runs at most 10 decisions at once", async () => {
    const ids = Array.from({ length: 25 }, (_, index) => `66c1884c0853f8a76a4db${String(index).padStart(3, "0")}`);
    ids.forEach((id) => addExpense({ _id: id }));
    let inFlight = 0;
    let peak = 0;
    vi.mocked(Expense.findOneAndUpdate).mockImplementation(((filter: Doc, update: never) => ({
      lean: async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 1));
        inFlight -= 1;
        const doc = store.find((candidate) => new Query(filter).test(candidate));
        if (doc) applyUpdate(doc, update);
        return doc ?? null;
      },
    })) as never);

    const result = await reviewExpenses({
      action: "approve",
      items: ids.map((id) => ({ id, revision: 3 })),
      reviewer: ADMIN,
    });

    expect(result.done).toEqual(ids);
    expect(peak).toBe(10);
  });

  it("needs an admin and a reason to reject", async () => {
    await expect(
      reviewExpenses({ action: "approve", items: [{ id: ID, revision: 0 }], reviewer: OWNER })
    ).rejects.toThrow("Only admins can approve or reject expenses");
    await expect(
      reviewExpenses({ action: "reject", items: [{ id: ID, revision: 0 }], reviewer: ADMIN })
    ).rejects.toThrow("Add a reason so the submitter knows what to fix");
    expect(Expense.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe("resubmitExpense", () => {
  const rejected = (overrides: Doc = {}) =>
    addExpense({
      approvalStatus: "rejected",
      reviewedBy: ADMIN._id,
      reviewedAt: NOW,
      rejectionReason: "Receipt missing",
      ...overrides,
    });

  it("sends the submitter's rejected expense back for review, clearing the decision", async () => {
    rejected();

    const outcome = await resubmitExpense({ id: ID, revision: 3, note: "Receipt attached now", user: OWNER, now: NOW });

    expect(Expense.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: ID, createdBy: OWNER._id, approvalStatus: "rejected", assetAllocationRevision: 3 },
      {
        $set: { approvalStatus: "pending", reviewedBy: null, reviewedAt: null, rejectionReason: null },
        $push: {
          approvalHistory: { action: "resubmitted", by: OWNER._id, at: NOW, note: "Receipt attached now" },
        },
        $inc: { assetAllocationRevision: 1 },
      },
      { new: true }
    );
    expect(outcome).toEqual({
      ok: true,
      expense: expect.objectContaining({ approvalStatus: "pending", rejectionReason: null, assetAllocationRevision: 4 }),
    });
  });

  it("only lets the person who submitted it resubmit", async () => {
    rejected();

    for (const user of [OTHER, ADMIN]) {
      expect(await resubmitExpense({ id: ID, revision: 3, note: null, user })).toEqual({
        ok: false,
        status: 403,
        code: "forbidden",
        error: "Only the person who submitted this expense can resubmit it",
      });
    }
    expect(store[0].approvalStatus).toBe("rejected");
  });

  it("only resubmits a rejected expense", async () => {
    addExpense({ approvalStatus: "pending" });

    expect(await resubmitExpense({ id: ID, revision: 3, note: null, user: OWNER })).toEqual({
      ok: false,
      status: 409,
      code: "not_rejected",
      error: "This expense is already awaiting approval.",
      approvalStatus: "pending",
    });
  });

  it("refuses a stale revision and a deleted expense", async () => {
    rejected({ assetAllocationRevision: 9 });
    expect(await resubmitExpense({ id: ID, revision: 3, note: null, user: OWNER })).toEqual(
      expect.objectContaining({ ok: false, status: 409, code: "stale" })
    );

    store = [];
    expect(await resubmitExpense({ id: ID, revision: 3, note: null, user: OWNER })).toEqual(
      expect.objectContaining({ ok: false, status: 404, code: "not_found" })
    );
  });
});

describe("reopenExpense", () => {
  const decided = (approvalStatus: "approved" | "rejected" | undefined, overrides: Doc = {}) => {
    const doc = addExpense({
      approvalStatus,
      reviewedBy: ADMIN._id,
      reviewedAt: NOW,
      rejectionReason: approvalStatus === "rejected" ? "Receipt missing" : null,
      ...overrides,
    });
    if (approvalStatus === undefined) delete doc.approvalStatus;
    return doc;
  };

  it("moves an approved expense back to pending in one conditional update, clearing the decision", async () => {
    decided("approved");

    const outcome = await reopenExpense({ id: ID, revision: 3, note: "Wrong category", reviewer: MASTER, now: NOW });

    expect(Expense.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(Expense.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: ID,
        approvalStatus: { $in: ["approved", "rejected", null] },
        createdBy: { $ne: MASTER._id },
        $and: [
          { assetAllocationRevision: 3 },
          { $or: [{ assetAllocatedAmount: { $exists: false } }, { assetAllocatedAmount: { $lte: 0 } }] },
        ],
      },
      {
        $set: { approvalStatus: "pending", reviewedBy: null, reviewedAt: null, rejectionReason: null },
        $push: { approvalHistory: { action: "reopened", by: MASTER._id, at: NOW, note: "Wrong category" } },
        $inc: { assetAllocationRevision: 1 },
      },
      { new: true }
    );
    expect(outcome).toEqual({
      ok: true,
      expense: expect.objectContaining({
        approvalStatus: "pending",
        reviewedBy: null,
        reviewedAt: null,
        assetAllocationRevision: 4,
        linkedAssetCount: 0,
      }),
    });
    expect((store[0].approvalHistory as Doc[]).at(-1)).toEqual({
      action: "reopened",
      by: MASTER._id,
      at: NOW,
      note: "Wrong category",
    });
  });

  it("reopens a rejected expense, clearing the reason", async () => {
    decided("rejected");

    expect((await reopenExpense({ id: ID, revision: 3, note: null, reviewer: ADMIN, now: NOW })).ok).toBe(true);
    expect(store[0]).toEqual(
      expect.objectContaining({ approvalStatus: "pending", rejectionReason: null, reviewedBy: null })
    );
  });

  it("reopens a legacy expense with no status and no revision", async () => {
    decided(undefined);
    delete store[0].assetAllocationRevision;

    const outcome = await reopenExpense({ id: ID, revision: 0, note: null, reviewer: ADMIN, now: NOW });

    expect(outcome.ok).toBe(true);
    expect(store[0]).toEqual(expect.objectContaining({ approvalStatus: "pending", assetAllocationRevision: 1 }));
  });

  it("refuses an expense that is already waiting", async () => {
    addExpense();

    expect(await reopenExpense({ id: ID, revision: 3, note: null, reviewer: ADMIN })).toEqual({
      ok: false,
      status: 409,
      code: "not_reviewed",
      error: "This expense is already awaiting approval.",
      approvalStatus: "pending",
    });
    expect(store[0].assetAllocationRevision).toBe(3);
  });

  it("refuses an expense with assets registered against it, by allocation or by a linked asset", async () => {
    const error =
      "Assets are registered against this expense, so it can't go back to review. Reverse its assets first.";
    decided("approved", { assetAllocatedAmount: 1200 });

    expect(await reopenExpense({ id: ID, revision: 3, note: null, reviewer: ADMIN })).toEqual({
      ok: false,
      status: 409,
      code: "asset_linked",
      error,
      approvalStatus: "approved",
    });

    // A legacy link with no allocation recorded on the expense.
    store = [];
    decided("approved", { assetAllocatedAmount: 0 });
    assets.push({ purchaseExpense: ID });
    expect(await reopenExpense({ id: ID, revision: 3, note: null, reviewer: ADMIN })).toEqual(
      expect.objectContaining({ ok: false, status: 409, code: "asset_linked", error })
    );
    expect(Expense.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(store[0].approvalStatus).toBe("approved");
  });

  it("never lets an admin reopen their own expense", async () => {
    decided("approved", { createdBy: ADMIN._id });

    expect(await reopenExpense({ id: ID, revision: 3, note: null, reviewer: ADMIN })).toEqual(
      expect.objectContaining({ ok: false, status: 403, code: "own_expense" })
    );
    expect(store[0].approvalStatus).toBe("approved");
  });

  it("refuses a stale revision and a deleted expense", async () => {
    decided("approved", { assetAllocationRevision: 6 });
    expect(await reopenExpense({ id: ID, revision: 3, note: null, reviewer: ADMIN })).toEqual({
      ok: false,
      status: 409,
      code: "stale",
      error: "This expense changed after you opened it. Check the latest version, then try again.",
      approvalStatus: "approved",
    });

    store = [];
    expect(await reopenExpense({ id: ID, revision: 3, note: null, reviewer: ADMIN })).toEqual(
      expect.objectContaining({ ok: false, status: 404, code: "not_found" })
    );
  });

  it("lets only one of two admins reopening at the same time win", async () => {
    decided("approved");

    const [reopened, again] = await Promise.all([
      reopenExpense({ id: ID, revision: 3, note: null, reviewer: ADMIN }),
      reopenExpense({ id: ID, revision: 3, note: null, reviewer: MASTER }),
    ]);

    expect(reopened.ok).toBe(true);
    expect(again).toEqual(expect.objectContaining({ ok: false, code: "not_reviewed" }));
    expect(store[0].approvalHistory).toHaveLength(2);
  });

  it("is admin-only", async () => {
    decided("approved");

    await expect(reopenExpense({ id: ID, revision: 3, note: null, reviewer: OTHER })).rejects.toThrow(
      "Only admins can move an expense back to review"
    );
    expect(Expense.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe("edit revision", () => {
  it("reads an optional, valid revision", () => {
    expect(parseEditRevision(undefined)).toBeNull();
    expect(parseEditRevision(null)).toBeNull();
    expect(parseEditRevision(0)).toBe(0);
    expect(parseEditRevision(7)).toBe(7);
    for (const raw of ["7", -1, 1.5, Number.NaN]) {
      expect(() => parseEditRevision(raw)).toThrow("Expense version is missing or invalid. Reload and try again.");
    }
  });

  it("explains a stale edit with the current status", () => {
    const error =
      "This expense changed while you were editing it (for example, an admin reviewed it). Reload to see the latest version.";
    expect(staleEditConflict({ approvalStatus: "rejected" })).toEqual({ error, code: "stale", approvalStatus: "rejected" });
    expect(staleEditConflict({})).toEqual({ error, code: "stale", approvalStatus: "approved" });
    expect(staleEditConflict(null)).toEqual({ error, code: "stale" });
  });
});

describe("approvalChangeAfterEdit", () => {
  const expense = (approvalStatus?: "pending" | "approved" | "rejected", owner = OWNER._id) => ({
    approvalStatus,
    createdBy: { toString: () => owner },
  });

  it("sends an approved (or legacy) expense back when its submitter changes an accounting field", () => {
    for (const status of ["approved", undefined] as const) {
      expect(
        approvalChangeAfterEdit({ expense: expense(status), editor: OWNER, accountingChanged: true, now: NOW })
      ).toEqual({
        $set: { approvalStatus: "pending", reviewedBy: null, reviewedAt: null, rejectionReason: null },
        $push: {
          approvalHistory: { action: "resubmitted", by: OWNER._id, at: NOW, note: EDIT_RESUBMIT_NOTE.afterApproval },
        },
      });
    }
  });

  it("keeps an approved expense approved after a title-only edit", () => {
    expect(approvalChangeAfterEdit({ expense: expense("approved"), editor: OWNER, accountingChanged: false })).toBeNull();
  });

  it("sends a rejected expense back on any save by its submitter", () => {
    expect(
      approvalChangeAfterEdit({ expense: expense("rejected"), editor: OWNER, accountingChanged: false, now: NOW })
    ).toEqual(
      expect.objectContaining({
        $push: {
          approvalHistory: { action: "resubmitted", by: OWNER._id, at: NOW, note: EDIT_RESUBMIT_NOTE.afterRejection },
        },
      })
    );
  });

  it("leaves pending expenses and admins' edits alone", () => {
    expect(approvalChangeAfterEdit({ expense: expense("pending"), editor: OWNER, accountingChanged: true })).toBeNull();
    for (const status of ["approved", "rejected", "pending"] as const) {
      expect(approvalChangeAfterEdit({ expense: expense(status), editor: ADMIN, accountingChanged: true })).toBeNull();
    }
  });
});

describe("countPendingApprovals", () => {
  it("counts and totals only pending expenses, in base currency", async () => {
    addExpense({ _id: ID, amountInBaseCurrency: 100.105, createdAt: new Date("2026-11-10T00:00:00.000Z") });
    addExpense({ _id: ID2, amountInBaseCurrency: undefined, amount: 50, createdAt: new Date("2026-11-05T00:00:00.000Z") });
    delete store[1].amountInBaseCurrency;
    for (const doc of store) delete doc.approvalHistory;
    addExpense({ _id: ID3, approvalStatus: "rejected", amountInBaseCurrency: 999 });
    store.push({ _id: "legacy", amount: 1000, amountInBaseCurrency: 1000, createdAt: new Date("2026-01-01") });

    expect(await countPendingApprovals()).toEqual({
      pendingCount: 2,
      pendingAmount: 150.11,
      oldestPendingAt: "2026-11-05T00:00:00.000Z",
    });
    expect(vi.mocked(Expense.aggregate).mock.calls[0][0][0]).toEqual({ $match: PENDING_MATCH });
  });

  it("dates the wait from each expense's latest submission, not its creation", async () => {
    const at = (iso: string) => new Date(iso);
    // Created long ago, rejected, then resubmitted last week.
    addExpense({
      _id: ID,
      createdAt: at("2026-10-01T00:00:00.000Z"),
      approvalHistory: [
        { action: "submitted", by: OWNER._id, at: at("2026-10-01T00:00:00.000Z"), note: null },
        { action: "rejected", by: ADMIN._id, at: at("2026-10-02T00:00:00.000Z"), note: "Receipt missing" },
        { action: "resubmitted", by: OWNER._id, at: at("2026-11-18T00:00:00.000Z"), note: null },
      ],
    });
    // Approved on creation by an admin, moved back to review two days ago.
    addExpense({
      _id: ID2,
      createdAt: at("2026-09-01T00:00:00.000Z"),
      approvalHistory: [
        { action: "auto_approved", by: ADMIN._id, at: at("2026-09-01T00:00:00.000Z"), note: null },
        { action: "reopened", by: MASTER._id, at: at("2026-11-17T00:00:00.000Z"), note: null },
      ],
    });
    // Submitted three days ago.
    addExpense({
      _id: ID3,
      createdAt: at("2026-11-16T00:00:00.000Z"),
      approvalHistory: [{ action: "submitted", by: OWNER._id, at: at("2026-11-16T00:00:00.000Z"), note: null }],
    });

    expect((await countPendingApprovals()).oldestPendingAt).toBe("2026-11-16T00:00:00.000Z");

    // Without a submission step it falls back to the creation time.
    store[2].approvalHistory = [];
    store[2].createdAt = at("2026-11-12T00:00:00.000Z");
    expect((await countPendingApprovals()).oldestPendingAt).toBe("2026-11-12T00:00:00.000Z");
  });

  it("reports an empty queue", async () => {
    expect(await countPendingApprovals()).toEqual({ pendingCount: 0, pendingAmount: 0, oldestPendingAt: null });
  });

  it("leaves out the asking admin's own submissions, matching on an ObjectId (aggregations aren't cast)", async () => {
    await countPendingApprovals(ADMIN._id);
    const [stage] = vi.mocked(Expense.aggregate).mock.calls[0][0] as { $match: Record<string, unknown> }[];
    const createdBy = (stage.$match.createdBy as { $ne: unknown }).$ne;
    expect(createdBy).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(String(createdBy)).toBe(ADMIN._id);
    expect(stage.$match.approvalStatus).toBe("pending");
  });
});

describe("parseApprovalRequest", () => {
  it("reads each action with what it needs", () => {
    expect(parseApprovalRequest({ action: "approve", revision: 0, reason: "ignored" })).toEqual({
      action: "approve",
      revision: 0,
    });
    expect(parseApprovalRequest({ action: "reject", revision: 2, reason: " Wrong amount " })).toEqual({
      action: "reject",
      revision: 2,
      reason: "Wrong amount",
    });
    expect(parseApprovalRequest({ action: "resubmit", revision: 4, note: "  " })).toEqual({
      action: "resubmit",
      revision: 4,
      note: null,
    });
    expect(parseApprovalRequest({ action: "reopen", revision: 6, note: " Wrong category " })).toEqual({
      action: "reopen",
      revision: 6,
      note: "Wrong category",
    });
  });

  it("refuses bad actions, revisions, reasons and notes", () => {
    expect(() => parseApprovalRequest(null)).toThrow("Request body is invalid");
    expect(() => parseApprovalRequest({ action: "delete", revision: 1 })).toThrow(
      "Choose approve, reject, resubmit or reopen"
    );
    expect(() => parseApprovalRequest({ action: "reopen", revision: 1, note: "x".repeat(501) })).toThrow(
      "Keep the note under 500 characters"
    );
    for (const revision of [undefined, -1, 1.5, "3", Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => parseApprovalRequest({ action: "approve", revision })).toThrow(
        "Expense version is missing or invalid. Reload and try again."
      );
    }
    expect(() => parseApprovalRequest({ action: "reject", revision: 1, reason: "no" })).toThrow(
      "Add a reason so the submitter knows what to fix"
    );
    expect(() => parseApprovalRequest({ action: "reject", revision: 1, reason: "x".repeat(501) })).toThrow(
      "Keep the reason under 500 characters"
    );
    expect(() => parseApprovalRequest({ action: "resubmit", revision: 1, note: 5 })).toThrow("Note must be text");
  });
});

describe("parseBulkReviewRequest", () => {
  const items = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      id: `66c1884c0853f8a76a4db${String(index).padStart(3, "0")}`,
      revision: 0,
    }));

  it("normalises ids and requires a reason only to reject", () => {
    expect(
      parseBulkReviewRequest({ action: "approve", items: [{ id: ` ${ID.toUpperCase()} `, revision: 1 }] })
    ).toEqual({ action: "approve", items: [{ id: ID, revision: 1 }], reason: null });
    expect(parseBulkReviewRequest({ action: "reject", items: items(1), reason: "Duplicate" }).reason).toBe("Duplicate");
    expect(() => parseBulkReviewRequest({ action: "reject", items: items(1) })).toThrow(
      "Add a reason so the submitter knows what to fix"
    );
  });

  it(`takes 1 to ${MAX_BULK_REVIEW} distinct, valid expenses`, () => {
    expect(parseBulkReviewRequest({ action: "approve", items: items(MAX_BULK_REVIEW) }).items).toHaveLength(
      MAX_BULK_REVIEW
    );
    expect(() => parseBulkReviewRequest({ action: "approve", items: items(MAX_BULK_REVIEW + 1) })).toThrow(
      "You can review at most 100 expenses at a time"
    );
    expect(() => parseBulkReviewRequest({ action: "approve", items: [] })).toThrow("Select at least one expense");
    expect(() => parseBulkReviewRequest({ action: "approve" })).toThrow("Select at least one expense");
    expect(() =>
      parseBulkReviewRequest({ action: "approve", items: [{ id: ID, revision: 1 }, { id: ID.toUpperCase(), revision: 2 }] })
    ).toThrow("Each expense can only be included once");
    for (const item of [{ id: "nope", revision: 0 }, { revision: 0 }, "x", { id: ID, revision: -1 }]) {
      expect(() => parseBulkReviewRequest({ action: "approve", items: [item] })).toThrow();
    }
    expect(() => parseBulkReviewRequest({ action: "resubmit", items: items(1) })).toThrow("Choose approve or reject");
  });
});
