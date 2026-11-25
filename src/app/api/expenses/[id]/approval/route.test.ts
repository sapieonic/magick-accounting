import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { POST } from "./route";
import { verifyAuth, type AuthUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { resubmitExpense, reviewExpense } from "@/lib/approval-server";
import { notifyReviewOutcome } from "@/lib/approval-notify";

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, verifyAuth: vi.fn() };
});
vi.mock("@/lib/mongodb", () => ({ connectDB: vi.fn() }));
vi.mock("@/lib/approval-server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/approval-server")>();
  return { ...actual, reviewExpense: vi.fn(), resubmitExpense: vi.fn() };
});
vi.mock("@/lib/approval-notify", () => ({ notifyReviewOutcome: vi.fn() }));

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
  vi.clearAllMocks();
  vi.mocked(connectDB).mockResolvedValue(undefined as never);
  vi.mocked(verifyAuth).mockResolvedValue(ADMIN);
  vi.mocked(reviewExpense).mockResolvedValue({ ok: true, expense: EXPENSE });
  vi.mocked(resubmitExpense).mockResolvedValue({ ok: true, expense: { ...EXPENSE, approvalStatus: "pending" } });
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
      [{ action: "delete", revision: 0 }, "Choose approve, reject or resubmit"],
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
  });
});
