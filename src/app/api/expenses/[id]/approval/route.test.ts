import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { POST } from "./route";
import { verifyAuth, type AuthUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { reopenExpense, resubmitExpense, reviewExpense } from "@/lib/approval-server";
import { notifyReviewOutcome } from "@/lib/approval-notify";

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, verifyAuth: vi.fn() };
});
vi.mock("@/lib/mongodb", () => ({ connectDB: vi.fn() }));
vi.mock("@/lib/approval-server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/approval-server")>();
  return { ...actual, reviewExpense: vi.fn(), resubmitExpense: vi.fn(), reopenExpense: vi.fn() };
});
vi.mock("@/lib/approval-notify", () => ({ notifyReviewOutcome: vi.fn() }));
// `after()` needs a request scope; run its callback once the handler has returned.
const afterCallbacks: (() => unknown)[] = [];
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (callback: () => unknown) => afterCallbacks.push(callback),
}));
async function runAfterCallbacks() {
  for (const callback of afterCallbacks.splice(0)) await callback();
}

const ID = "66c1884c0853f8a76a4da201";
const ADMIN: AuthUser = { _id: "66c1884c0853f8a76a4da001", email: "a@x.com", name: "Priya", role: "admin" };
const OWNER: AuthUser = { _id: "66c1884c0853f8a76a4da101", email: "o@x.com", name: "Asha", role: "user" };
const EXPENSE = { _id: ID, title: "Taxi", approvalStatus: "approved", linkedAssetCount: 0 };

function post(body: unknown, id = ID) {
  return POST(
    { json: async () => (body instanceof Error ? Promise.reject(body) : body) } as unknown as NextRequest,
    { params: Promise.resolve({ id }) }
  );
}

beforeEach(() => {
  afterCallbacks.length = 0;
  vi.clearAllMocks();
  vi.mocked(connectDB).mockResolvedValue(undefined as never);
  vi.mocked(verifyAuth).mockResolvedValue(ADMIN);
  vi.mocked(reviewExpense).mockResolvedValue({ ok: true, expense: EXPENSE });
  vi.mocked(resubmitExpense).mockResolvedValue({ ok: true, expense: { ...EXPENSE, approvalStatus: "pending" } });
  vi.mocked(reopenExpense).mockResolvedValue({ ok: true, expense: { ...EXPENSE, approvalStatus: "pending" } });
  vi.mocked(notifyReviewOutcome).mockResolvedValue(undefined);
});

describe("POST /api/expenses/:id/approval", () => {
  it("passes an auth failure straight through", async () => {
    vi.mocked(verifyAuth).mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));

    expect((await post({ action: "approve", revision: 0 })).status).toBe(401);
    expect(reviewExpense).not.toHaveBeenCalled();
  });

  it("approves at the revision the admin saw, then tells the submitter", async () => {
    const response = await post({ action: "approve", revision: 3 });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ expense: EXPENSE });
    expect(reviewExpense).toHaveBeenCalledWith({
      id: ID,
      action: "approve",
      revision: 3,
      reason: null,
      reviewer: ADMIN,
    });
    // Nothing is sent until the response has gone out.
    expect(notifyReviewOutcome).not.toHaveBeenCalled();
    await runAfterCallbacks();
    expect(notifyReviewOutcome).toHaveBeenCalledWith({
      action: "approve",
      expenses: [EXPENSE],
      reason: null,
      reviewer: ADMIN,
    });
    expect(vi.mocked(reviewExpense).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(notifyReviewOutcome).mock.invocationCallOrder[0]
    );
  });

  it("rejects with the trimmed reason", async () => {
    vi.mocked(verifyAuth).mockResolvedValue({ ...ADMIN, role: "master_admin" });

    const response = await post({ action: "reject", revision: 0, reason: "  Receipt missing " });

    expect(response.status).toBe(200);
    expect(reviewExpense).toHaveBeenCalledWith(
      expect.objectContaining({ action: "reject", revision: 0, reason: "Receipt missing" })
    );
    await runAfterCallbacks();
    expect(notifyReviewOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ action: "reject", reason: "Receipt missing" })
    );
  });

  it("only lets admins approve or reject", async () => {
    vi.mocked(verifyAuth).mockResolvedValue(OWNER);

    for (const body of [
      { action: "approve", revision: 0 },
      { action: "reject", revision: 0, reason: "Looks fine to me" },
    ]) {
      const response = await post(body);
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "Admin access required" });
    }
    expect(reviewExpense).not.toHaveBeenCalled();
  });

  it("lets the submitter resubmit with an optional note, without a Telegram notice", async () => {
    vi.mocked(verifyAuth).mockResolvedValue(OWNER);

    const response = await post({ action: "resubmit", revision: 5, note: " It was a client visit " });

    expect(response.status).toBe(200);
    expect((await response.json()).expense.approvalStatus).toBe("pending");
    expect(resubmitExpense).toHaveBeenCalledWith({ id: ID, revision: 5, note: "It was a client visit", user: OWNER });
    await runAfterCallbacks();
    expect(notifyReviewOutcome).not.toHaveBeenCalled();
  });

  it("refuses someone else's resubmission", async () => {
    vi.mocked(resubmitExpense).mockResolvedValue({
      ok: false,
      status: 403,
      code: "forbidden",
      error: "Only the person who submitted this expense can resubmit it",
    });

    const response = await post({ action: "resubmit", revision: 0 });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Only the person who submitted this expense can resubmit it",
      code: "forbidden",
    });
  });

  it("returns conflicts with a code (and the current status) and sends no notice", async () => {
    vi.mocked(reviewExpense).mockResolvedValue({
      ok: false,
      status: 409,
      code: "not_pending",
      error: "This expense was already approved.",
      approvalStatus: "approved",
    });

    const response = await post({ action: "approve", revision: 2 });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "This expense was already approved.",
      code: "not_pending",
      approvalStatus: "approved",
    });
    await runAfterCallbacks();
    expect(notifyReviewOutcome).not.toHaveBeenCalled();
  });

  it("returns 404 for a deleted expense", async () => {
    vi.mocked(reviewExpense).mockResolvedValue({
      ok: false,
      status: 404,
      code: "not_found",
      error: "This expense no longer exists. It may have been deleted.",
    });

    const response = await post({ action: "approve", revision: 2 });

    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe("not_found");
  });

  it("validates the id and body before touching the database", async () => {
    const cases: [unknown, string, string?][] = [
      [{ action: "approve", revision: 0 }, "Expense id is invalid", "nope"],
      [new SyntaxError("Unexpected token"), "Request body is invalid"],
      [{ action: "delete", revision: 0 }, "Choose approve, reject, resubmit or reopen"],
      [{ action: "reopen" }, "Expense version is missing or invalid. Reload and try again."],
      [{ action: "reopen", revision: 0, note: 7 }, "Note must be text"],
      [{ action: "approve" }, "Expense version is missing or invalid. Reload and try again."],
      [{ action: "approve", revision: -1 }, "Expense version is missing or invalid. Reload and try again."],
      [{ action: "approve", revision: "2" }, "Expense version is missing or invalid. Reload and try again."],
      [{ action: "reject", revision: 0 }, "Add a reason so the submitter knows what to fix"],
      [{ action: "reject", revision: 0, reason: "x".repeat(501) }, "Keep the reason under 500 characters"],
      [{ action: "resubmit", revision: 0, note: "x".repeat(501) }, "Keep the note under 500 characters"],
    ];
    for (const [body, error, id] of cases) {
      const response = await post(body, id);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error });
    }
    expect(connectDB).not.toHaveBeenCalled();
    expect(reviewExpense).not.toHaveBeenCalled();
    expect(resubmitExpense).not.toHaveBeenCalled();
    expect(reopenExpense).not.toHaveBeenCalled();
  });

  it("refuses an admin's decision on their own expense", async () => {
    const ownExpense = {
      ok: false as const,
      status: 403 as const,
      code: "own_expense" as const,
      error: "You can't review your own expense. Another admin needs to approve or reject it.",
    };
    vi.mocked(reviewExpense).mockResolvedValue(ownExpense);
    vi.mocked(reopenExpense).mockResolvedValue(ownExpense);

    for (const body of [
      { action: "approve", revision: 1 },
      { action: "reopen", revision: 1 },
    ]) {
      const response = await post(body);
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: ownExpense.error, code: "own_expense" });
    }
    await runAfterCallbacks();
    expect(notifyReviewOutcome).not.toHaveBeenCalled();
  });
});

describe("POST /api/expenses/:id/approval reopen", () => {
  it("moves an expense back to review with the admin's note, then tells the submitter", async () => {
    const response = await post({ action: "reopen", revision: 4, note: "  Wrong category " });

    expect(response.status).toBe(200);
    expect((await response.json()).expense.approvalStatus).toBe("pending");
    expect(reopenExpense).toHaveBeenCalledWith({ id: ID, revision: 4, note: "Wrong category", reviewer: ADMIN });
    expect(reviewExpense).not.toHaveBeenCalled();
    expect(notifyReviewOutcome).not.toHaveBeenCalled();
    await runAfterCallbacks();
    expect(notifyReviewOutcome).toHaveBeenCalledWith({
      action: "reopen",
      expenses: [{ ...EXPENSE, approvalStatus: "pending" }],
      reason: "Wrong category",
      reviewer: ADMIN,
    });
  });

  it("is admin-only", async () => {
    vi.mocked(verifyAuth).mockResolvedValue(OWNER);

    const response = await post({ action: "reopen", revision: 4 });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Admin access required" });
    expect(reopenExpense).not.toHaveBeenCalled();
  });

  it("returns each refusal with its code and sends no notice", async () => {
    const refusals = [
      { status: 409 as const, code: "not_reviewed" as const, error: "This expense is already awaiting approval.", approvalStatus: "pending" as const },
      {
        status: 409 as const,
        code: "asset_linked" as const,
        error: "Assets are registered against this expense, so it can't go back to review. Reverse its assets first.",
        approvalStatus: "approved" as const,
      },
      { status: 409 as const, code: "stale" as const, error: "This expense changed after you opened it.", approvalStatus: "rejected" as const },
    ];
    for (const refusal of refusals) {
      vi.mocked(reopenExpense).mockResolvedValue({ ok: false, ...refusal });

      const response = await post({ action: "reopen", revision: 4 });

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({
        error: refusal.error,
        code: refusal.code,
        approvalStatus: refusal.approvalStatus,
      });
    }
    await runAfterCallbacks();
    expect(notifyReviewOutcome).not.toHaveBeenCalled();
  });
});
