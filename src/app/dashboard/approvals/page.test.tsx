import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import ApprovalsPage from "./page";
import { useAuth } from "@/contexts/AuthContext";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { ApiError, api } from "@/lib/api";

const toastMock = vi.fn();
const replace = vi.fn();

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/dashboard/approvals",
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("@/hooks/useTitle", () => ({ useTitle: vi.fn() }));
vi.mock("@/hooks/useMediaQuery", () => ({ useMediaQuery: vi.fn() }));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: toastMock }) }));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ApiError: actual.ApiError, api: { get: vi.fn(), post: vi.fn() } };
});

const INR = { _id: "inr", code: "INR", name: "Indian Rupee", symbol: "₹", isBase: true };

function pendingExpense(id: string, title: string, amount: number, overrides: Record<string, unknown> = {}) {
  return {
    _id: id,
    title,
    amount,
    amountInBaseCurrency: amount,
    currency: INR,
    date: "2026-11-20T00:00:00.000Z",
    description: "",
    paymentSource: "pocket",
    category: { _id: "cat", name: "Travel" },
    department: { _id: "dep", name: "Sales" },
    createdBy: { _id: "u-asha", name: "Asha Rao", email: "asha@example.com" },
    approvalStatus: "pending",
    approvalHistory: [{ action: "submitted", by: "u-asha", at: "2026-11-20T10:00:00.000Z", note: null }],
    assetAllocationRevision: 2,
    createdAt: "2026-11-20T10:00:00.000Z",
    ...overrides,
  };
}

const lunch = pendingExpense("e1", "Client lunch", 1200);
const taxi = pendingExpense("e2", "Taxi", 450);
const hotel = pendingExpense("e3", "Hotel", 3000);

let listed: Record<string, unknown>[] = [];

/** Which media queries match: by default the wide layout (side panel + checkboxes). */
function setViewport(wide: boolean) {
  vi.mocked(useMediaQuery).mockImplementation(() => wide);
}

function lastToast() {
  return toastMock.mock.calls.at(-1)!;
}

function postCalls(url: string) {
  return vi.mocked(api.post).mock.calls.filter(([u]) => u === url);
}

async function renderQueue() {
  render(<ApprovalsPage />);
  return screen.findByRole("region", { name: "Approval queue" });
}

/** Lets the undo window lapse and the request settle. */
async function lapseUndoWindow() {
  await act(async () => {
    vi.advanceTimersByTime(5000);
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("ApprovalsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setViewport(true);
    listed = [lunch, taxi, hotel];
    vi.mocked(useAuth).mockReturnValue({
      isAdmin: true,
      user: { _id: "u-priya", name: "Priya", email: "priya@example.com", role: "admin" },
    } as any);
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url.startsWith("/api/users")) return { users: [{ _id: "u-asha", name: "Asha Rao", email: "asha@example.com" }] };
      if (url.startsWith("/api/expenses?")) {
        return {
          expenses: listed,
          pagination: { total: listed.length, hasMore: false, nextCursor: null },
          summary: { pendingCount: listed.length, pendingAmount: listed.reduce((s, e: any) => s + e.amount, 0) },
        };
      }
      return {};
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("asks only for pending expenses and sums the queue in the header", async () => {
    const queue = await renderQueue();
    const request = vi.mocked(api.get).mock.calls.map(([u]) => u).find((u) => u.startsWith("/api/expenses?"))!;
    const params = new URL(request, "http://x").searchParams;
    expect(params.get("approval")).toBe("pending");
    expect(params.get("includeSummary")).toBe("true");
    expect(params.get("limit")).toBe("50");
    expect(screen.getByText(/3 awaiting approval · ₹4,650.00/)).toBeInTheDocument();
    expect(within(queue).getByRole("button", { name: "Client lunch" })).toBeInTheDocument();
    expect(within(queue).getByRole("checkbox", { name: "Select Client lunch, ₹1,200.00" })).toBeInTheDocument();
  });

  it("says when everyone's caught up", async () => {
    listed = [];
    await renderQueue();
    expect(screen.getByRole("heading", { name: "You're all caught up" })).toBeInTheDocument();
    expect(screen.getByText(/New submissions from your team will appear here/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View all expenses" })).toHaveAttribute("href", "/dashboard/expenses");
  });

  it("offers a retry when the queue can't load", async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url.startsWith("/api/expenses?")) throw new Error("offline");
      return { users: [] };
    });
    await renderQueue();
    expect(screen.getByRole("heading", { name: "Couldn't load the approval queue" })).toBeInTheDocument();
    expect(toastMock).toHaveBeenCalledWith("Failed to load the approval queue", "error");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("sends non-admins back to the overview", () => {
    vi.mocked(useAuth).mockReturnValue({ isAdmin: false, user: { _id: "u1", role: "user" } } as any);
    render(<ApprovalsPage />);
    expect(replace).toHaveBeenCalledWith("/dashboard");
    expect(api.get).not.toHaveBeenCalled();
  });

  it("approves at once with an undo toast and sends the request only after the window", async () => {
    vi.mocked(api.post).mockResolvedValue({ expense: { ...lunch, approvalStatus: "approved" } });
    const queue = await renderQueue();
    fireEvent.click(within(queue).getByRole("button", { name: "Client lunch" }));
    vi.useFakeTimers();

    const panel = screen.getByRole("complementary", { name: "Selected expense" });
    fireEvent.click(within(panel).getByRole("button", { name: "Approve" }));

    // Gone from the queue straight away, with an Undo.
    expect(within(queue).queryByRole("button", { name: "Client lunch" })).not.toBeInTheDocument();
    const [message, type, options] = lastToast();
    expect(message).toBe('Approved "Client lunch"');
    expect(type).toBe("success");
    expect(options.action.label).toBe("Undo");
    expect(api.post).not.toHaveBeenCalled();

    await lapseUndoWindow();
    expect(api.post).toHaveBeenCalledWith("/api/expenses/e1/approval", { action: "approve", revision: 2 });
    expect(within(queue).queryByRole("button", { name: "Client lunch" })).not.toBeInTheDocument();
  });

  it("puts the expense back on Undo and never sends the request", async () => {
    const queue = await renderQueue();
    fireEvent.click(within(queue).getByRole("button", { name: "Taxi" }));
    vi.useFakeTimers();
    fireEvent.click(within(screen.getByRole("complementary", { name: "Selected expense" })).getByRole("button", { name: "Approve" }));
    expect(within(queue).queryByRole("button", { name: "Taxi" })).not.toBeInTheDocument();

    act(() => lastToast()[2].action.onClick());
    expect(within(queue).getByRole("button", { name: "Taxi" })).toBeInTheDocument();
    await lapseUndoWindow();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("opens the next expense after an approve and moves focus to it", async () => {
    const queue = await renderQueue();
    fireEvent.click(within(queue).getByRole("button", { name: "Client lunch" }));
    const panel = screen.getByRole("complementary", { name: "Selected expense" });
    fireEvent.click(within(panel).getByRole("button", { name: "Approve" }));

    const next = within(queue).getByRole("button", { name: "Taxi" });
    await waitFor(() => expect(next).toHaveFocus());
    expect(next).toHaveAttribute("aria-expanded", "true");
    expect(within(panel).getByRole("heading", { name: "Taxi" })).toBeInTheDocument();
  });

  it("moves to the previous expense at the end of the list, and to the empty state when none are left", async () => {
    listed = [lunch, taxi];
    const queue = await renderQueue();
    fireEvent.click(within(queue).getByRole("button", { name: "Taxi" }));
    const panel = screen.getByRole("complementary", { name: "Selected expense" });
    fireEvent.click(within(panel).getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(within(queue).getByRole("button", { name: "Client lunch" })).toHaveFocus());

    fireEvent.click(within(panel).getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "You're all caught up" })).toHaveFocus());
  });

  it("supports the keyboard: J/K move, A approves, and they pause while typing", async () => {
    const queue = await renderQueue();
    fireEvent.keyDown(document.body, { key: "j" });
    expect(within(queue).getByRole("button", { name: "Client lunch" })).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(document.body, { key: "j" });
    expect(within(queue).getByRole("button", { name: "Taxi" })).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(document.body, { key: "k" });
    expect(within(queue).getByRole("button", { name: "Client lunch" })).toHaveAttribute("aria-expanded", "true");

    // Typing "a" in the search box is just typing.
    fireEvent.keyDown(screen.getByLabelText("Search"), { key: "a" });
    expect(within(queue).getByRole("button", { name: "Client lunch" })).toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: "a" });
    expect(within(queue).queryByRole("button", { name: "Client lunch" })).not.toBeInTheDocument();
    expect(lastToast()[0]).toBe('Approved "Client lunch"');

    // Every shortcut is also a button.
    const panel = screen.getByRole("complementary", { name: "Selected expense" });
    expect(within(panel).getByRole("button", { name: "Approve" })).toHaveAttribute("aria-keyshortcuts", "A");
    expect(within(panel).getByRole("button", { name: "Reject…" })).toHaveAttribute("aria-keyshortcuts", "R");
    expect(within(panel).getByRole("button", { name: "Next expense" })).toHaveAttribute("aria-keyshortcuts", "J ArrowDown");
  });

  it("lists the shortcuts", async () => {
    await renderQueue();
    fireEvent.click(screen.getByRole("button", { name: "Keyboard shortcuts" }));
    const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
    expect(within(dialog).getByText("Approve the open expense")).toBeInTheDocument();
    expect(within(dialog).getByText("Reject the open expense (asks for a reason)")).toBeInTheDocument();
  });

  it("won't reject without a reason, then rejects with one after the undo window", async () => {
    vi.mocked(api.post).mockResolvedValue({ expense: { ...taxi, approvalStatus: "rejected" } });
    const queue = await renderQueue();
    fireEvent.click(within(queue).getByRole("button", { name: "Taxi" }));
    fireEvent.click(within(screen.getByRole("complementary", { name: "Selected expense" })).getByRole("button", { name: "Reject…" }));

    const dialog = screen.getByRole("dialog", { name: "Reject expense" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Reject expense" }));
    expect(within(dialog).getByText("Add a reason so the submitter knows what to fix.")).toBeInTheDocument();
    expect(within(queue).getByRole("button", { name: "Taxi" })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Receipt missing or unreadable" }));
    expect(within(dialog).getByRole("textbox")).toHaveValue("Receipt missing or unreadable");
    vi.useFakeTimers();
    fireEvent.click(within(dialog).getByRole("button", { name: "Reject expense" }));

    expect(screen.queryByRole("dialog", { name: "Reject expense" })).not.toBeInTheDocument();
    expect(within(queue).queryByRole("button", { name: "Taxi" })).not.toBeInTheDocument();
    expect(lastToast()[0]).toBe('Rejected "Taxi" — Asha Rao will see your reason');

    await lapseUndoWindow();
    expect(api.post).toHaveBeenCalledWith("/api/expenses/e2/approval", {
      action: "reject",
      revision: 2,
      reason: "Receipt missing or unreadable",
    });
  });

  it("re-reads a stale expense and puts its latest version back in the queue", async () => {
    vi.mocked(api.post).mockRejectedValue(
      new ApiError("This expense changed after you opened it.", 409, { code: "stale", approvalStatus: "pending" })
    );
    const updated = { ...lunch, title: "Client lunch (corrected)", amount: 1100, assetAllocationRevision: 3 };
    const defaultGet = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation(async (url: string) =>
      url === "/api/expenses/e1" ? { expense: updated } : defaultGet(url)
    );

    const queue = await renderQueue();
    vi.useFakeTimers();
    fireEvent.click(within(queue).getByRole("button", { name: "Client lunch" }));
    fireEvent.click(within(screen.getByRole("complementary", { name: "Selected expense" })).getByRole("button", { name: "Approve" }));
    await lapseUndoWindow();
    await act(async () => {
      await Promise.resolve();
    });
    vi.useRealTimers();

    await waitFor(() => expect(within(queue).getByRole("button", { name: "Client lunch (corrected)" })).toBeInTheDocument());
    expect(api.get).toHaveBeenCalledWith("/api/expenses/e1");
    expect(toastMock).toHaveBeenCalledWith(
      "Asha Rao changed this expense after you opened it — review the latest version.",
      "error"
    );
  });

  it("drops an expense another admin already reviewed", async () => {
    vi.mocked(api.post).mockRejectedValue(
      new ApiError("This expense was already rejected.", 409, { code: "not_pending", approvalStatus: "rejected" })
    );
    const defaultGet = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation(async (url: string) =>
      url === "/api/expenses/e1" ? { expense: { ...lunch, approvalStatus: "rejected" } } : defaultGet(url)
    );
    const queue = await renderQueue();
    vi.useFakeTimers();
    fireEvent.click(within(queue).getByRole("button", { name: "Client lunch" }));
    fireEvent.click(within(screen.getByRole("complementary", { name: "Selected expense" })).getByRole("button", { name: "Approve" }));
    await lapseUndoWindow();
    vi.useRealTimers();

    await waitFor(() => expect(toastMock).toHaveBeenCalledWith("Already rejected by another admin.", "info"));
    expect(within(queue).queryByRole("button", { name: "Client lunch" })).not.toBeInTheDocument();
  });

  it("bulk-approves after confirming, and keeps the ones that failed selected and refreshed", async () => {
    vi.mocked(api.post).mockResolvedValue({
      done: ["e1", "e3"],
      failed: [{ id: "e2", code: "stale", error: "changed" }],
    });
    const defaultGet = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation(async (url: string) =>
      url === "/api/expenses/e2" ? { expense: { ...taxi, amount: 500, assetAllocationRevision: 4 } } : defaultGet(url)
    );

    const queue = await renderQueue();
    fireEvent.click(within(queue).getByRole("checkbox", { name: "Select all 3" }));
    const bar = screen.getByRole("region", { name: "Selection" });
    expect(within(bar).getByText(/3 selected/)).toBeInTheDocument();
    fireEvent.click(within(bar).getByRole("button", { name: "Approve 3" }));

    const dialog = screen.getByRole("dialog", { name: "Approve 3 expenses" });
    expect(within(dialog).getByText(/They'll count in company totals/)).toBeInTheDocument();
    vi.useFakeTimers();
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve 3 expenses" }));
    expect(lastToast()[0]).toBe("Approved 3 expenses");
    expect(screen.queryByRole("region", { name: "Selection" })).not.toBeInTheDocument();

    await lapseUndoWindow();
    vi.useRealTimers();
    expect(postCalls("/api/expenses/approvals")[0][1]).toEqual({
      action: "approve",
      items: [
        { id: "e1", revision: 2 },
        { id: "e2", revision: 2 },
        { id: "e3", revision: 2 },
      ],
    });

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith("Approved 2 of 3. 1 changed and needs another look.", "error")
    );
    // The failed one is back, refreshed, and still ticked.
    expect(within(queue).getByRole("checkbox", { name: "Select Taxi, ₹500.00" })).toBeChecked();
    expect(within(queue).queryByRole("button", { name: "Client lunch" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Selection" })).getByText(/1 selected/)).toBeInTheDocument();
  });

  it("on phones, shows checkboxes only in Select mode and a sticky strip for the open expense", async () => {
    setViewport(false);
    const queue = await renderQueue();
    expect(within(queue).queryByRole("checkbox")).not.toBeInTheDocument();

    fireEvent.click(within(queue).getByRole("button", { name: "Taxi" }));
    const strip = screen.getByRole("region", { name: "Selected expense" });
    expect(within(strip).getByRole("button", { name: "Approve" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    expect(within(queue).getByRole("checkbox", { name: "Select Taxi, ₹450.00" })).toBeInTheDocument();
  });
});
