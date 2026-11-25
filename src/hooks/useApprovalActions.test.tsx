import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { useApprovalActions, type ApprovalActions, type ApprovalActionsOptions } from "@/hooks/useApprovalActions";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError, api } from "@/lib/api";
import { MAX_BULK_REVIEW } from "@/lib/approval";
import type { ExpenseListItem } from "@/types/expense";

const toastMock = vi.fn();
const dismissMock = vi.fn();
const refresh = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: toastMock, dismiss: dismissMock }) }));
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

/** Renders the hook with its dialogs, as a page does. */
function setup(options: ApprovalActionsOptions = {}) {
  const actions = { current: null as unknown as ApprovalActions };
  function Harness() {
    actions.current = useApprovalActions(options);
    return <>{actions.current.dialogs}</>;
  }
  render(<Harness />);
  return actions;
}

/** The most recent toast's message, type and options. */
const lastToast = () => toastMock.mock.calls.at(-1)!;

/** Lets the undo window lapse and the request (and its follow-ups) settle. */
async function lapse() {
  await act(async () => {
    vi.advanceTimersByTime(5000);
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("useApprovalActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let n = 0;
    toastMock.mockImplementation(() => `toast-${++n}`);
    asRole("admin");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("offers approve, reject and move back to review to admins only, and resubmit to everyone", () => {
    const { result, rerender } = renderHook(() => useApprovalActions());
    expect(result.current.handlers.onApprove).toBeTypeOf("function");
    expect(result.current.handlers.onReopen).toBeTypeOf("function");
    expect(result.current.handlers).toMatchObject({ viewerId: "admin1", viewerRole: "admin" });

    asRole("user");
    rerender();
    expect(result.current.handlers.onApprove).toBeUndefined();
    expect(result.current.handlers.onReject).toBeUndefined();
    expect(result.current.handlers.onReopen).toBeUndefined();
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

  it("won't let an admin approve or reject their own expense", () => {
    const own = expense("mine", { createdBy: { _id: "admin1", name: "Me", email: "me@example.com" } });
    const { result } = renderHook(() => useApprovalActions());
    act(() => result.current.approve([own]));
    expect(result.current.inFlight).toEqual({});
    expect(toastMock).toHaveBeenCalledWith(
      "You can't review your own expense. Another admin needs to approve or reject it.",
      "info"
    );
    expect(api.post).not.toHaveBeenCalled();
  });

  it("closes the Undo toast once the request goes out, and says when Undo comes too late", async () => {
    vi.useFakeTimers();
    vi.mocked(api.post).mockResolvedValue({ expense: { ...expense("a"), approvalStatus: "approved" } });
    const actions = setup();

    act(() => actions.current.approve([expense("a")]));
    const [message, , options] = lastToast();
    expect(message).toBe('Approved "Expense a"');
    expect(dismissMock).not.toHaveBeenCalled();

    // A flush (e.g. the page reloading its list) sends it before the window lapses.
    await act(async () => {
      await actions.current.flush();
    });
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(dismissMock).toHaveBeenCalledWith("toast-1");

    // An Undo that still lands (the toast was on its way out) is refused in words.
    act(() => options.action.onClick());
    expect(lastToast()).toEqual([
      "Too late to undo — it's already approved. You can move it back to review from its details.",
      "info",
    ]);
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it("splits a large bulk review into requests the server accepts", async () => {
    vi.useFakeTimers();
    vi.mocked(api.post).mockImplementation(async (_url, body: any) => ({
      done: body.items.map((item: { id: string }) => item.id),
      failed: [],
    }));
    const many = Array.from({ length: MAX_BULK_REVIEW + 5 }, (_, i) => expense(`e${i}`));
    const { result } = renderHook(() => useApprovalActions());
    act(() => result.current.approve(many));
    expect(toastMock.mock.calls[0][0]).toBe(`Approved ${many.length} expenses`);

    await lapse();
    const bodies = vi.mocked(api.post).mock.calls.map(([, body]) => body as any);
    expect(bodies.map((b) => b.items.length)).toEqual([MAX_BULK_REVIEW, 5]);
    expect(bodies[0]).toMatchObject({ action: "approve" });
  });

  it("reports a bulk request that couldn't be sent as a connection problem, not as changed expenses", async () => {
    vi.useFakeTimers();
    vi.mocked(api.post).mockImplementation(async (_url, body: any) => {
      if (body.items.length < MAX_BULK_REVIEW) throw new TypeError("Failed to fetch");
      return { done: body.items.map((item: { id: string }) => item.id), failed: [] };
    });
    const many = Array.from({ length: MAX_BULK_REVIEW + 3 }, (_, i) => expense(`e${i}`));
    const { result } = renderHook(() => useApprovalActions());
    act(() => result.current.approve(many));
    await lapse();

    expect(lastToast()).toEqual([
      `Approved ${MAX_BULK_REVIEW} of ${many.length}. 3 couldn't be sent. Check your connection and try again.`,
      "error",
    ]);
    // Nothing is known about the unsent ones, so they aren't re-read.
    expect(api.get).not.toHaveBeenCalled();
  });

  it("says when a whole bulk review couldn't be sent", async () => {
    vi.useFakeTimers();
    vi.mocked(api.post).mockRejectedValue(new TypeError("Failed to fetch"));
    const { result } = renderHook(() => useApprovalActions());
    act(() => result.current.approve([expense("a"), expense("b"), expense("c")]));
    await lapse();
    expect(lastToast()).toEqual(["Couldn't approve 3 expenses. Check your connection and try again.", "error"]);
    expect(result.current.inFlight).toEqual({});
  });

  it("names each kind of bulk failure", async () => {
    vi.useFakeTimers();
    vi.mocked(api.post).mockResolvedValue({
      done: ["a"],
      failed: [
        { id: "b", code: "stale" },
        { id: "c", code: "not_pending" },
        { id: "d", code: "own_expense" },
      ],
    });
    vi.mocked(api.get).mockImplementation(async (url: string) => ({ expense: { _id: url.split("/").pop() } }));
    const { result } = renderHook(() => useApprovalActions());
    act(() => result.current.approve(["a", "b", "c", "d"].map((id) => expense(id))));
    await lapse();
    expect(lastToast()).toEqual([
      "Approved 1 of 4. 1 changed and needs another look. 1 was already reviewed by another admin. 1 is your own — another admin needs to review it.",
      "error",
    ]);
  });

  it("hands back an expense whose review was refused as the viewer's own", async () => {
    vi.useFakeTimers();
    const onReturned = vi.fn();
    vi.mocked(api.post).mockRejectedValue(
      new ApiError("You can't review your own expense.", 403, { code: "own_expense" })
    );
    const { result } = renderHook(() => useApprovalActions({ onReturned }));
    act(() => result.current.approve([expense("a")]));
    await lapse();
    expect(toastMock).toHaveBeenCalledWith(
      "You can't review your own expense. Another admin needs to approve or reject it.",
      "error"
    );
    expect(onReturned).toHaveBeenCalledWith(expect.objectContaining({ _id: "a" }));
    expect(result.current.inFlight).toEqual({});
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

describe("useApprovalActions: move back to review", () => {
  const approved = expense("a", {
    approvalStatus: "approved",
    reviewedBy: { _id: "p", name: "Priya" },
    reviewedAt: "2026-11-12T09:00:00.000Z",
    assetAllocationRevision: 4,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    toastMock.mockReturnValue("toast-1");
    asRole("admin");
  });

  /** Opens the confirm dialog for `target` and confirms it, optionally with a note. */
  async function reopen(actions: { current: ApprovalActions }, target: ExpenseListItem, note?: string) {
    act(() => actions.current.handlers.onReopen!(target));
    const dialog = screen.getByRole("dialog", { name: "Move back to review" });
    if (note) fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: note } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Move back to review" }));
    });
    return dialog;
  }

  it("confirms first, then moves it back with the note and hands over the server's expense", async () => {
    const onUpdated = vi.fn();
    vi.mocked(api.post).mockResolvedValue({
      expense: { ...approved, approvalStatus: "pending", reviewedBy: null, reviewedAt: null, assetAllocationRevision: 5 },
    });
    const actions = setup({ onUpdated });

    act(() => actions.current.handlers.onReopen!(approved));
    const dialog = screen.getByRole("dialog", { name: "Move back to review" });
    expect(dialog).toHaveTextContent("It will stop counting in totals until it's approved again.");
    expect(api.post).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "  Approved by mistake " } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Move back to review" }));
    });
    expect(api.post).toHaveBeenCalledWith("/api/expenses/a/approval", {
      action: "reopen",
      revision: 4,
      note: "Approved by mistake",
    });
    expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ _id: "a", approvalStatus: "pending", assetAllocationRevision: 5 }));
    expect(toastMock).toHaveBeenCalledWith('Moved "Expense a" back to review. It\'s awaiting approval again.');
    expect(refresh).toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Move back to review" })).not.toBeInTheDocument();
  });

  it("says why a rejected expense's move clears the rejection", () => {
    const actions = setup();
    act(() => actions.current.handlers.onReopen!({ ...approved, approvalStatus: "rejected", rejectionReason: "Duplicate" }));
    expect(screen.getByRole("dialog", { name: "Move back to review" })).toHaveTextContent(
      "Its rejection is withdrawn, so it can be approved without being resubmitted."
    );
  });

  it.each([
    [
      "asset_linked",
      new ApiError("Assets…", 409, { code: "asset_linked" }),
      "Assets are registered against this expense, so it can't go back to review. Reverse its assets first.",
      "error",
    ],
    [
      "own_expense",
      new ApiError("Own", 403, { code: "own_expense" }),
      "You can't move your own expense back to review. Another admin needs to do it.",
      "error",
    ],
    [
      "not_reviewed",
      new ApiError("Pending", 409, { code: "not_reviewed", approvalStatus: "pending" }),
      "This expense is already awaiting approval.",
      "info",
    ],
    [
      "stale",
      new ApiError("Changed", 409, { code: "stale" }),
      "This expense changed after you opened it — check the latest version, then try again.",
      "error",
    ],
  ])("explains a refused move (%s) and closes the dialog", async (_code, error, message, type) => {
    vi.mocked(api.post).mockRejectedValue(error);
    vi.mocked(api.get).mockResolvedValue({ expense: { ...approved, approvalStatus: "pending" } });
    const actions = setup();
    await reopen(actions, approved);
    expect(toastMock).toHaveBeenCalledWith(message, type);
    expect(screen.queryByRole("dialog", { name: "Move back to review" })).not.toBeInTheDocument();
  });

  it("re-reads the expense after a conflict", async () => {
    const onUpdated = vi.fn();
    vi.mocked(api.post).mockRejectedValue(new ApiError("Changed", 409, { code: "stale" }));
    vi.mocked(api.get).mockResolvedValue({ expense: { ...approved, amount: 120, assetAllocationRevision: 6 } });
    const actions = setup({ onUpdated });
    await reopen(actions, approved);
    expect(api.get).toHaveBeenCalledWith("/api/expenses/a");
    expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ amount: 120, assetAllocationRevision: 6 }));
  });

  it("keeps the dialog open to retry when the request didn't get through", async () => {
    vi.mocked(api.post).mockRejectedValue(new TypeError("Failed to fetch"));
    const actions = setup();
    const dialog = await reopen(actions, approved, "Wrong department");
    expect(toastMock).toHaveBeenCalledWith("Couldn't move it back to review. Check your connection and try again.", "error");
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole("textbox")).toHaveValue("Wrong department");
  });
});
