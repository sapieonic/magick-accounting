import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";
import { verifyAuth, type AuthUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { countPendingApprovals, reviewExpenses } from "@/lib/approval-server";
import { notifyReviewOutcome } from "@/lib/approval-notify";
import { MAX_BULK_REVIEW } from "@/lib/approval";

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, verifyAuth: vi.fn() };
});
vi.mock("@/lib/mongodb", () => ({ connectDB: vi.fn() }));
vi.mock("@/lib/approval-server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/approval-server")>();
  return { ...actual, reviewExpenses: vi.fn(), countPendingApprovals: vi.fn() };
});
vi.mock("@/lib/approval-notify", () => ({ notifyReviewOutcome: vi.fn() }));

const ADMIN: AuthUser = { _id: "66c1884c0853f8a76a4da001", email: "a@x.com", name: "Priya", role: "admin" };
const USER: AuthUser = { _id: "66c1884c0853f8a76a4da101", email: "o@x.com", name: "Asha", role: "user" };
const ID = "66c1884c0853f8a76a4da201";
const ID2 = "66c1884c0853f8a76a4da202";

const idAt = (index: number) => `66c1884c0853f8a76a4db${String(index).padStart(3, "0")}`;

function post(body: unknown) {
  return POST({ json: async () => body } as unknown as NextRequest);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(connectDB).mockResolvedValue(undefined as never);
  vi.mocked(verifyAuth).mockResolvedValue(ADMIN);
  vi.mocked(notifyReviewOutcome).mockResolvedValue(undefined);
});

describe("GET /api/expenses/approvals", () => {
  it("returns the queue size to admins", async () => {
    const counts = { pendingCount: 4, pendingAmount: 12340, oldestPendingAt: "2026-11-14T09:00:00.000Z" };
    vi.mocked(countPendingApprovals).mockResolvedValue(counts);

    const response = await GET({} as NextRequest);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(counts);
  });

  it("is admin-only", async () => {
    vi.mocked(verifyAuth).mockResolvedValue(USER);

    const response = await GET({} as NextRequest);

    expect(response.status).toBe(403);
    expect(countPendingApprovals).not.toHaveBeenCalled();
  });
});

describe("POST /api/expenses/approvals", () => {
  it("reviews every item and reports partial success without the documents", async () => {
    const reviewed = [{ _id: ID, createdBy: USER._id }];
    vi.mocked(reviewExpenses).mockResolvedValue({
      done: [ID],
      failed: [{ id: ID2, code: "stale", error: "This expense changed after you opened it. Review the latest version." }],
      reviewed,
    });

    const response = await post({
      action: "reject",
      items: [
        { id: ID.toUpperCase(), revision: 1 },
        { id: ID2, revision: 0 },
      ],
      reason: " Duplicate ",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      done: [ID],
      failed: [{ id: ID2, code: "stale", error: "This expense changed after you opened it. Review the latest version." }],
    });
    expect(reviewExpenses).toHaveBeenCalledWith({
      action: "reject",
      items: [
        { id: ID, revision: 1 },
        { id: ID2, revision: 0 },
      ],
      reason: "Duplicate",
      reviewer: ADMIN,
    });
    expect(notifyReviewOutcome).toHaveBeenCalledWith({
      action: "reject",
      expenses: reviewed,
      reason: "Duplicate",
      reviewer: ADMIN,
    });
  });

  it("sends no notice when nothing went through", async () => {
    vi.mocked(reviewExpenses).mockResolvedValue({
      done: [],
      failed: [{ id: ID, code: "not_pending", error: "This expense was already approved." }],
      reviewed: [],
    });

    const response = await post({ action: "approve", items: [{ id: ID, revision: 0 }] });

    expect(response.status).toBe(200);
    expect(notifyReviewOutcome).not.toHaveBeenCalled();
  });

  it("is admin-only", async () => {
    vi.mocked(verifyAuth).mockResolvedValue(USER);

    const response = await post({ action: "approve", items: [{ id: ID, revision: 0 }] });

    expect(response.status).toBe(403);
    expect(reviewExpenses).not.toHaveBeenCalled();
  });

  it(`accepts up to ${MAX_BULK_REVIEW} expenses`, async () => {
    vi.mocked(reviewExpenses).mockResolvedValue({ done: [], failed: [], reviewed: [] });
    const items = Array.from({ length: MAX_BULK_REVIEW }, (_, index) => ({ id: idAt(index), revision: 0 }));

    expect((await post({ action: "approve", items })).status).toBe(200);

    const tooMany = await post({ action: "approve", items: [...items, { id: idAt(MAX_BULK_REVIEW), revision: 0 }] });
    expect(tooMany.status).toBe(400);
    expect(await tooMany.json()).toEqual({ error: "You can review at most 100 expenses at a time" });
    expect(reviewExpenses).toHaveBeenCalledTimes(1);
  });

  it("refuses malformed requests", async () => {
    const cases: [unknown, string][] = [
      [null, "Request body is invalid"],
      [{ action: "resubmit", items: [{ id: ID, revision: 0 }] }, "Choose approve or reject"],
      [{ action: "approve", items: [] }, "Select at least one expense"],
      [{ action: "approve", items: [{ id: "abc", revision: 0 }] }, "Expense id is invalid"],
      [
        { action: "approve", items: [{ id: ID, revision: 0 }, { id: ID.toUpperCase(), revision: 0 }] },
        "Each expense can only be included once",
      ],
      [
        { action: "approve", items: [{ id: ID, revision: 1.5 }] },
        "Expense version is missing or invalid. Reload and try again.",
      ],
      [{ action: "reject", items: [{ id: ID, revision: 0 }] }, "Add a reason so the submitter knows what to fix"],
    ];
    for (const [body, error] of cases) {
      const response = await post(body);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error });
    }
    expect(reviewExpenses).not.toHaveBeenCalled();
    expect(connectDB).not.toHaveBeenCalled();
  });
});
