import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useApprovalActions } from "@/hooks/useApprovalActions";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError, api } from "@/lib/api";
import { MAX_BULK_REVIEW } from "@/lib/approval";
import type { ExpenseListItem } from "@/types/expense";

const toastMock = vi.fn();
const refresh = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: toastMock }) }));
vi.mock("@/contexts/ApprovalCountContext", () => ({
  useApprovalCount: () => ({ count: 0, pendingAmount: 0, oldestPendingAt: null, refresh }),
}));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ApiError: actual.ApiError, api: { get: vi.fn(), post: vi.fn() } };
});

function expense(id: string, overrides: Partial<ExpenseListItem> = {}): ExpenseListItem {
  return {
    _id: id,
    title: `Expense ${id}`,
    amount: 100,
    date: "2026-11-20T00:00:00.000Z",
    description: "",
    category: { _id: "c", name: "Travel" },
    department: { _id: "d", name: "Sales" },
    createdBy: { _id: "u1", name: "Asha Rao", email: "asha@example.com" },
    approvalStatus: "pending",
    assetAllocationRevision: 1,
    ...overrides,
  };
}

function asRole(role: "admin" | "user") {
  vi.mocked(useAuth).mockReturnValue({
    user: { _id: role === "admin" ? "admin1" : "u1", name: "Me", email: "me@example.com", role },
  } as any);
}

describe("useApprovalActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asRole("admin");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("offers approve and reject to admins only, and resubmit to everyone", () => {
    const { result, rerender } = renderHook(() => useApprovalActions());
    expect(result.current.canReview).toBe(true);
    expect(result.current.handlers.onApprove).toBeTypeOf("function");
    expect(result.current.handlers.viewerId).toBe("admin1");

    asRole("user");
    rerender();
    expect(result.current.canReview).toBe(false);
    expect(result.current.handlers.onApprove).toBeUndefined();
    expect(result.current.handlers.onReject).toBeUndefined();
    expect(result.current.handlers.onResubmit).toBeTypeOf("function");
  });

  it("marks expenses in flight, ignores ones already in flight, and refreshes the count once committed", async () => {
    vi.useFakeTimers();
    const onUpdated = vi.fn();
    vi.mocked(api.post).mockResolvedValue({ expense: { ...expense("a"), approvalStatus: "approved" } });
    const { result } = renderHook(() => useApprovalActions({ onUpdated }));

    act(() => result.current.approve([expense("a")]));
    expect(result.current.inFlight).toEqual({ a: "approve" });
    act(() => result.current.approve([expense("a")]));
    expect(toastMock).toHaveBeenCalledTimes(1);

    await act(async () => vi.advanceTimersByTime(5000));
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ _id: "a", approvalStatus: "approved" }));
    expect(result.current.inFlight).toEqual({});
    expect(refresh).toHaveBeenCalled();
  });

  it("splits a large bulk review into requests the server accepts", async () => {
    vi.useFakeTimers();
    vi.mocked(api.post).mockImplementation(async (_url, body: any) => ({
      done: body.items.map((item: { id: string }) => item.id),
      failed: [],
    }));
    const many = Array.from({ length: MAX_BULK_REVIEW + 5 }, (_, i) => expense(`e${i}`));
    const { result } = renderHook(() => useApprovalActions());
    act(() => result.current.reject(many, "Duplicate"));
    expect(toastMock.mock.calls[0][0]).toBe(`Rejected ${many.length} expenses — Asha Rao will see your reason`);

    await act(async () => vi.advanceTimersByTime(5000));
    await act(async () => {
      await Promise.resolve();
    });
    const bodies = vi.mocked(api.post).mock.calls.map(([, body]) => body as any);
    expect(bodies.map((b) => b.items.length)).toEqual([MAX_BULK_REVIEW, 5]);
    expect(bodies[0]).toMatchObject({ action: "reject", reason: "Duplicate" });
  });

  it("resubmits now with the note and hands back the pending expense", async () => {
    asRole("user");
    const onUpdated = vi.fn();
    vi.mocked(api.post).mockResolvedValue({ expense: { ...expense("a"), approvalStatus: "pending" } });
    const { result } = renderHook(() => useApprovalActions({ onUpdated }));

    let ok = false;
    await act(async () => {
      ok = await result.current.resubmit(expense("a", { approvalStatus: "rejected" }), "Client was there");
    });
    expect(ok).toBe(true);
    expect(api.post).toHaveBeenCalledWith("/api/expenses/a/approval", { action: "resubmit", revision: 1, note: "Client was there" });
    expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ approvalStatus: "pending" }));
    expect(toastMock).toHaveBeenCalledWith("Resubmitted. An admin will review it again.");
  });

  it("explains a refused resubmit in plain words", async () => {
    asRole("user");
    vi.mocked(api.post).mockRejectedValue(
      new ApiError("Only the person who submitted this expense can resubmit it", 403, { code: "forbidden" })
    );
    const { result } = renderHook(() => useApprovalActions());
    let ok = true;
    await act(async () => {
      ok = await result.current.resubmit(expense("a", { approvalStatus: "rejected" }), null);
    });
    expect(ok).toBe(false);
    expect(toastMock).toHaveBeenCalledWith("Only the person who submitted this expense can resubmit it.", "error");
  });
});
