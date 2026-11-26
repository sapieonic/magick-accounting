import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import ExpensesPage from "./page";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError, api } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
import { byAmount } from "@/test/amount";

const toastMock = vi.fn();

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/contexts/ThemeContext", () => ({
  useTheme: vi.fn(() => ({ theme: "light" })),
}));

vi.mock("@/components/ui/Toast", () => ({
  useToast: vi.fn(() => ({
    toast: toastMock,
  })),
}));

vi.mock("@/hooks/useTitle", () => ({
  useTitle: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => ({
  ApiError: (await importOriginal<typeof import("@/lib/api")>()).ApiError,
  api: {
    get: vi.fn(),
    delete: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock("@/lib/csv", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/csv")>()),
  downloadCsv: vi.fn(),
}));

const expense = {
  _id: "expense-1",
  title: "AWS India Cloud Services",
  amount: 5678.76,
  amountInBaseCurrency: 5678.76,
  currency: { _id: "currency-1", code: "INR", name: "Indian Rupee", symbol: "₹", isBase: true },
  date: "2026-07-02T00:00:00.000Z",
  description: "",
  paymentSource: "company",
  category: { _id: "category-1", name: "Software & Subscriptions" },
  department: { _id: "department-1", name: "Engineering" },
  createdBy: { _id: "user-1", name: "Manas Nilorout", email: "manas@example.com" },
};

const splitExpense = {
  ...expense,
  _id: "expense-2",
  title: "Team offsite hotel",
  amount: 100,
  amountInBaseCurrency: 8350,
  currency: { _id: "currency-2", code: "USD", name: "US Dollar", symbol: "$", isBase: false },
  paymentSource: "split",
  pocketAmount: 40,
  pocketAmountInBaseCurrency: 3340,
};

const goaTrip = {
  _id: "trip-1",
  name: "Goa client visit",
  destinations: ["Goa"],
  startDate: "2026-10-12T00:00:00.000Z",
  endDate: "2026-10-15T00:00:00.000Z",
  travelers: [{ _id: "user-1", name: "Manas Nilorout", email: "manas@example.com" }],
  status: "completed",
};

const flightExpense = {
  ...expense,
  _id: "expense-3",
  title: "Flight to Goa",
  amount: 12000,
  amountInBaseCurrency: 12000,
  date: "2026-09-20T00:00:00.000Z",
  receiptKey: "receipts/flight.pdf",
  receiptFilename: "flight.pdf",
  trip: { _id: "trip-1", name: "Goa client visit" },
  travelType: "flight",
};

const hotelExpense = {
  ...expense,
  _id: "expense-4",
  title: "Beach hotel",
  amount: 8000,
  amountInBaseCurrency: 8000,
  date: "2026-10-12T00:00:00.000Z",
  trip: { _id: "trip-1", name: "Goa client visit" },
  travelType: "stay",
};

let listedExpenses: Record<string, unknown>[] = [expense];
let listedTrips: Record<string, unknown> = {};
/** Rows the grouped list pages over (a trip counts once). */
let listedItemTotal: number | null = null;
const DEFAULT_SUMMARY = { totalAmount: 5678.76, totalExpenses: 1, companyAmount: 5678.76, pocketAmount: 0 };
let listedSummary: Record<string, unknown> = DEFAULT_SUMMARY;

/** Answers `/api/expenses` page requests by their `cursor` ("" for the first page), like the server. */
function mockExpensePages(pages: Record<string, Record<string, unknown>>) {
  const defaultGet = vi.mocked(api.get).getMockImplementation()!;
  vi.mocked(api.get).mockImplementation((url: string) => {
    if (!url.startsWith("/api/expenses")) return defaultGet(url);
    const cursor = new URL(url, "http://localhost").searchParams.get("cursor") ?? "";
    return Promise.resolve({ summary: listedSummary, ...pages[cursor] });
  });
}

/** The `cursor` the last `/api/expenses` request continued from. */
function lastCursor(): string | null {
  return new URL(expenseRequests().at(-1)!, "http://localhost").searchParams.get("cursor");
}

/** The figure of the totals band's stat labelled `label`. */
function statValue(totals: HTMLElement, label: string): string | null {
  const stat = within(totals).getByText(label).parentElement!;
  return stat.querySelector(".num, .figure")?.textContent ?? null;
}

/** Lets the undo window of a delete run out and the DELETE request settle. */
async function lapseUndoWindow() {
  await act(async () => {
    vi.advanceTimersByTime(5000);
    await Promise.resolve();
    await Promise.resolve();
  });
}

function expenseRequests(): string[] {
  return vi.mocked(api.get).mock.calls.map(([url]) => url).filter((url) => url.startsWith("/api/expenses"));
}

describe("ExpensesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listedExpenses = [expense];
    listedTrips = {};
    listedItemTotal = null;
    listedSummary = DEFAULT_SUMMARY;
    window.history.replaceState(null, "", "/dashboard/expenses");
    vi.mocked(useAuth).mockReturnValue({ isAdmin: true } as any);
    vi.mocked(api.delete).mockResolvedValue({});
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.startsWith("/api/lookups")) {
        return Promise.resolve({
          departments: [{ _id: "department-1", name: "Engineering" }],
          categories: [{ _id: "category-1", name: "Software & Subscriptions" }],
        });
      }
      if (url.startsWith("/api/users")) {
        return Promise.resolve({
          users: [{ _id: "user-1", name: "Manas Nilorout", email: "manas@example.com" }],
        });
      }
      if (url.startsWith("/api/expenses")) {
        const grouped = url.includes("groupTrips=true");
        return Promise.resolve({
          expenses: listedExpenses,
          ...(grouped ? { trips: listedTrips } : {}),
          pagination: {
            total: grouped && listedItemTotal !== null ? listedItemTotal : listedExpenses.length,
            hasMore: false,
            nextCursor: null,
          },
          summary: listedSummary,
        });
      }
      return Promise.resolve({});
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the filtered total with its company/pocket split", async () => {
    render(<ExpensesPage />);

    const totals = await screen.findByRole("region", { name: "Totals" });
    expect(within(totals).getByText("All time total")).toBeInTheDocument();
    expect(within(totals).getByText("1 approved expense")).toBeInTheDocument();
    // The split comes with the list's summary, so it follows the same filters.
    expect(await within(totals).findByRole("img", { name: "Company paid 100.0%, pocket 0.0%" })).toBeInTheDocument();
    // The total, and all of it company-paid.
    expect(within(totals).getAllByText(byAmount("₹5,678.76"))).toHaveLength(2);
    expect(expenseRequests()[0]).toContain("includeSummary=true");
    expect(vi.mocked(api.get).mock.calls.some(([url]) => url.startsWith("/api/dashboard"))).toBe(false);
    // The old analytics rail is gone.
    expect(screen.queryByLabelText("Expense analytics")).not.toBeInTheDocument();
    expect(screen.queryByText("Monthly Trend")).not.toBeInTheDocument();
  });

  it("labels a bookmarked month outside the last year as that month", async () => {
    window.history.replaceState(null, "", "/dashboard/expenses?month=2024-01");
    render(<ExpensesPage />);

    const totals = await screen.findByRole("region", { name: "Totals" });
    expect(within(totals).getByText("January 2024 total")).toBeInTheDocument();
    const dates = screen.getByRole("combobox", { name: "Dates" }) as HTMLSelectElement;
    expect(dates).toHaveValue("2024-01");
    expect(dates.selectedOptions[0]).toHaveTextContent("January 2024");
    expect(screen.getByText(/Everyone · January 2024/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^January 2024\s*\(remove\)$/ })).toBeInTheDocument();
    expect(expenseRequests()[0]).toContain("from=2024-01-01&to=2024-01-31");
  });

  it("ignores a ?month= that isn't a month", async () => {
    window.history.replaceState(null, "", "/dashboard/expenses?month=2024-13");
    render(<ExpensesPage />);

    const totals = await screen.findByRole("region", { name: "Totals" });
    expect(within(totals).getByText("All time total")).toBeInTheDocument();
    expect(expenseRequests()[0]).not.toContain("from=");
  });

  it("shows the selected expense in a side panel on wide screens", async () => {
    const matchMedia = vi.fn((query: string) => ({
      matches: true,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    vi.stubGlobal("matchMedia", matchMedia);
    try {
      listedExpenses = [expense, splitExpense];
      render(<ExpensesPage />);

      const panel = await screen.findByRole("complementary", { name: "Selected expense" });
      expect(within(panel).getByText("No expense selected")).toBeInTheDocument();
      expect(within(panel).getByRole("separator", { name: "Resize expense details" })).toHaveAttribute(
        "aria-orientation",
        "vertical"
      );

      const row = screen.getByRole("button", { name: "Team offsite hotel" });
      fireEvent.click(row);
      expect(row).toHaveAttribute("aria-expanded", "true");
      expect(row).toHaveAttribute("aria-controls", "expense-detail-panel");
      expect(within(panel).getByRole("heading", { name: "Team offsite hotel" })).toBeInTheDocument();
      expect(within(panel).getByText("Split · $40.00 pocket / $60.00 company")).toBeInTheDocument();
      expect(within(panel).getByText("= ₹8,350.00 at ₹83.50 per USD, fixed on entry")).toBeInTheDocument();
      expect(within(panel).getByRole("link", { name: "Edit" })).toHaveAttribute("href", "/dashboard/expenses/expense-2/edit");

      fireEvent.click(within(panel).getByRole("button", { name: "Close details" }));
      expect(row).toHaveAttribute("aria-expanded", "false");
      expect(within(panel).getByText("No expense selected")).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("takes a deleted expense out of the company/pocket split, and puts it back on undo", async () => {
    render(<ExpensesPage />);

    const totals = await screen.findByRole("region", { name: "Totals" });
    expect(within(totals).getByRole("img", { name: "Company paid 100.0%, pocket 0.0%" })).toBeInTheDocument();

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Delete AWS India Cloud Services" }));
    expect(within(totals).getByRole("img", { name: "Company paid 0.0%, pocket 0.0%" })).toBeInTheDocument();

    const undo = toastMock.mock.calls.at(-1)?.[2]?.action;
    act(() => undo.onClick());
    expect(within(totals).getByRole("img", { name: "Company paid 100.0%, pocket 0.0%" })).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });
    expect(api.delete).not.toHaveBeenCalled();
  });

  it("commits the delete once the undo window lapses, keeping it out of the totals", async () => {
    render(<ExpensesPage />);

    const totals = await screen.findByRole("region", { name: "Totals" });
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Delete AWS India Cloud Services" }));
    expect(api.delete).not.toHaveBeenCalled();

    await lapseUndoWindow();

    expect(api.delete).toHaveBeenCalledWith("/api/expenses/expense-1");
    expect(api.delete).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("AWS India Cloud Services")).not.toBeInTheDocument();
    // The summary and split stay without it (no refetch puts it back).
    expect(statValue(totals, "All time total")).toBe("₹0.00");
    expect(within(totals).getByText("0 approved expenses")).toBeInTheDocument();
    expect(within(totals).getByRole("img", { name: "Company paid 0.0%, pocket 0.0%" })).toBeInTheDocument();
    // Undo after the commit does nothing.
    const undo = toastMock.mock.calls.find(([message]) => message === 'Deleted "AWS India Cloud Services"')?.[2]?.action;
    act(() => undo.onClick());
    expect(screen.queryByText("AWS India Cloud Services")).not.toBeInTheDocument();
  });

  it("puts the expense and its totals back when the delete fails", async () => {
    vi.mocked(api.delete).mockRejectedValueOnce(new Error("offline"));
    render(<ExpensesPage />);

    const totals = await screen.findByRole("region", { name: "Totals" });
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Delete AWS India Cloud Services" }));
    expect(screen.queryByText("AWS India Cloud Services")).not.toBeInTheDocument();

    await lapseUndoWindow();

    expect(api.delete).toHaveBeenCalledWith("/api/expenses/expense-1");
    expect(toastMock).toHaveBeenCalledWith("Failed to delete expense", "error");
    expect(screen.getByText("AWS India Cloud Services")).toBeInTheDocument();
    expect(within(totals).getByText("1 approved expense")).toBeInTheDocument();
    expect(within(totals).getByRole("img", { name: "Company paid 100.0%, pocket 0.0%" })).toBeInTheDocument();
    expect(screen.getByText("Showing 1 of 1 item · each trip counts as one")).toBeInTheDocument();
  });

  it("rounds the totals as expenses are deleted, so they never read -₹0.00", async () => {
    listedExpenses = [
      { ...expense, _id: "a", title: "Stamp", amount: 0.1, amountInBaseCurrency: 0.1 },
      { ...expense, _id: "b", title: "Envelope", amount: 0.2, amountInBaseCurrency: 0.2 },
    ];
    listedSummary = { totalAmount: 0.3, totalExpenses: 2, companyAmount: 0.3, pocketAmount: 0 };
    render(<ExpensesPage />);

    const totals = await screen.findByRole("region", { name: "Totals" });
    fireEvent.click(screen.getByRole("button", { name: "Delete Stamp" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete Envelope" }));

    expect(within(totals).getByText("0 approved expenses")).toBeInTheDocument();
    expect(statValue(totals, "All time total")).toBe("₹0.00");
    expect(within(totals).queryByText(/-₹/)).not.toBeInTheDocument();
  });

  it("moves the payer's own share with a delete and its undo", async () => {
    window.history.replaceState(null, "", "/dashboard/expenses?paidBy=user-1");
    const pocketExpense = {
      ...expense,
      _id: "own",
      title: "Taxi",
      amount: 1000,
      amountInBaseCurrency: 1000,
      paymentSource: "pocket",
      pocketAmount: 1000,
      pocketAmountInBaseCurrency: 1000,
    };
    // Two payers; only Manas's company part (200) counts towards him.
    const sharedExpense = {
      ...expense,
      _id: "shared",
      title: "Client dinner",
      amount: 300,
      amountInBaseCurrency: 300,
      paymentSource: "multiple",
      pocketAmount: 100,
      pocketAmountInBaseCurrency: 100,
      createdBy: { _id: "user-2", name: "Ravi", email: "ravi@example.com" },
      payments: [
        { paidBy: { _id: "user-1", name: "Manas Nilorout", email: "manas@example.com" }, amount: 200, amountInBaseCurrency: 200, source: "company" },
        { paidBy: { _id: "user-2", name: "Ravi", email: "ravi@example.com" }, amount: 100, amountInBaseCurrency: 100, source: "pocket" },
      ],
    };
    listedExpenses = [pocketExpense, sharedExpense];
    listedSummary = {
      totalAmount: 1300,
      totalExpenses: 2,
      companyAmount: 200,
      pocketAmount: 1100,
      payerSpend: { totalSpend: 1200, pocketSpend: 1000, companySpend: 200 },
    };
    render(<ExpensesPage />);

    const totals = await screen.findByRole("region", { name: "Totals" });
    expect(await within(totals).findByText("₹1,000.00 pocket · ₹200.00 company")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete Client dinner" }));
    expect(within(totals).getByText("₹1,000.00 pocket · ₹0.00 company")).toBeInTheDocument();

    act(() => toastMock.mock.calls.at(-1)?.[2]?.action.onClick());
    expect(within(totals).getByText("₹1,000.00 pocket · ₹200.00 company")).toBeInTheDocument();
    expect(statValue(totals, "Paid by Manas Nilorout")).toBe("₹1,200.00");

    // Submitted by them and not shared: all of it is theirs.
    fireEvent.click(screen.getByRole("button", { name: "Delete Taxi" }));
    expect(within(totals).getByText("₹0.00 pocket · ₹200.00 company")).toBeInTheDocument();
    expect(statValue(totals, "Paid by Manas Nilorout")).toBe("₹200.00");
  });

  it("gives a regular user their own share, and only lets them change what they submitted", async () => {
    vi.mocked(useAuth).mockReturnValue({
      isAdmin: false,
      user: { _id: "user-1", name: "Manas Nilorout", email: "manas@example.com", role: "user" },
    } as any);
    const manas = { _id: "user-1", name: "Manas Nilorout", email: "manas@example.com" };
    const ravi = { _id: "user-2", name: "Ravi", email: "ravi@example.com" };
    const taxi = {
      ...expense,
      _id: "taxi",
      title: "Taxi",
      amount: 1000,
      amountInBaseCurrency: 1000,
      paymentSource: "pocket",
      pocketAmount: 1000,
      pocketAmountInBaseCurrency: 1000,
    };
    // Ravi's bill; Manas paid 200 of it on the company card.
    const dinner = {
      ...expense,
      _id: "dinner",
      title: "Client dinner",
      amount: 300,
      amountInBaseCurrency: 300,
      paymentSource: "multiple",
      pocketAmount: 100,
      pocketAmountInBaseCurrency: 100,
      createdBy: ravi,
      payments: [
        { paidBy: manas, amount: 200, amountInBaseCurrency: 200, source: "company" },
        { paidBy: ravi, amount: 100, amountInBaseCurrency: 100, source: "pocket" },
      ],
    };
    // Manas's bill, awaiting approval; he paid 150 of 500 from pocket, Ravi the rest.
    const lunch = {
      ...expense,
      _id: "lunch",
      title: "Team lunch",
      amount: 500,
      amountInBaseCurrency: 500,
      approvalStatus: "pending",
      paymentSource: "multiple",
      pocketAmount: 500,
      pocketAmountInBaseCurrency: 500,
      payments: [
        { paidBy: manas, amount: 150, amountInBaseCurrency: 150, source: "pocket" },
        { paidBy: ravi, amount: 350, amountInBaseCurrency: 350, source: "pocket" },
      ],
    };
    listedExpenses = [taxi, dinner, lunch];
    // As the server sums it for him: 1000 + 200 approved, his 150 of the lunch awaiting approval.
    listedSummary = {
      totalAmount: 1200,
      totalExpenses: 2,
      companyAmount: 200,
      pocketAmount: 1000,
      pendingCount: 1,
      pendingAmount: 150,
      rejectedCount: 0,
    };
    render(<ExpensesPage />);

    const totals = await screen.findByRole("region", { name: "Totals" });
    expect(await within(totals).findByText("2 approved expenses · your share")).toBeInTheDocument();
    expect(statValue(totals, "All time total")).toBe("₹1,200.00");
    expect(statValue(totals, "Awaiting approval")).toBe("₹150.00");

    // Ravi's bill is listed for Manas to see, but only Ravi (or an admin) changes it.
    expect(screen.getByText("Client dinner")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete Client dinner" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Edit Client dinner")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete Team lunch" })).toBeInTheDocument();
    expect(screen.getByLabelText("Edit Team lunch")).toBeInTheDocument();

    // Deleting his own pending shared bill takes only his 150 out of Awaiting
    // approval (not the whole 500), and leaves the approved total alone.
    fireEvent.click(screen.getByRole("button", { name: "Delete Team lunch" }));
    expect(statValue(totals, "All time total")).toBe("₹1,200.00");
    expect(within(totals).queryByText("Awaiting approval")).not.toBeInTheDocument();
    expect(within(totals).getByRole("img", { name: "Company paid 16.7%, pocket 83.3%" })).toBeInTheDocument();

    act(() => toastMock.mock.calls.at(-1)?.[2]?.action.onClick());
    expect(statValue(totals, "Awaiting approval")).toBe("₹150.00");
    expect(statValue(totals, "All time total")).toBe("₹1,200.00");
  });

  it("names the department and category filter lists", async () => {
    render(<ExpensesPage />);

    fireEvent.click(await screen.findByRole("combobox", { name: "Department" }));
    expect(screen.getByRole("listbox", { name: "Filter by department" })).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    fireEvent.click(screen.getByRole("combobox", { name: "Category" }));
    expect(screen.getByRole("listbox", { name: "Filter by category" })).toBeInTheDocument();
  });

  it("continues the flat list from the server cursor after a committed delete", async () => {
    window.history.replaceState(null, "", "/dashboard/expenses?view=flat");
    mockExpensePages({
      "": { expenses: [expense, splitExpense], pagination: { total: 3, hasMore: true, nextCursor: "after-split" } },
      "after-split": { expenses: [hotelExpense], pagination: { total: 2, hasMore: false, nextCursor: null } },
    });
    render(<ExpensesPage />);

    expect(await screen.findByText("Showing 2 of 3 expenses")).toBeInTheDocument();
    expect(lastCursor()).toBeNull();
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Delete AWS India Cloud Services" }));
    await lapseUndoWindow();
    expect(api.delete).toHaveBeenCalledWith("/api/expenses/expense-1");
    vi.useRealTimers();

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));

    expect(await screen.findByText("Beach hotel")).toBeInTheDocument();
    // The cursor names the last row loaded, so the delete doesn't move it.
    expect(lastCursor()).toBe("after-split");
    expect(screen.getByText("Showing 2 of 2 expenses")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("keeps a delete that can still be undone out of the count while loading more", async () => {
    window.history.replaceState(null, "", "/dashboard/expenses?view=flat");
    mockExpensePages({
      "": { expenses: [expense, splitExpense], pagination: { total: 3, hasMore: true, nextCursor: "after-split" } },
      // Not deleted on the server yet, so the server still counts it.
      "after-split": { expenses: [hotelExpense], pagination: { total: 3, hasMore: false, nextCursor: null } },
    });
    render(<ExpensesPage />);

    await screen.findByText("Showing 2 of 3 expenses");
    fireEvent.click(screen.getByRole("button", { name: "Delete AWS India Cloud Services" }));
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));

    expect(await screen.findByText("Beach hotel")).toBeInTheDocument();
    expect(lastCursor()).toBe("after-split");
    expect(screen.getByText("Showing 2 of 2 expenses")).toBeInTheDocument();
    expect(api.delete).not.toHaveBeenCalled();
  });

  it("shows a dash, not a skeleton, for the split when the list fails to load", async () => {
    const defaultGet = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation((url: string) =>
      url.startsWith("/api/expenses") ? Promise.reject(new Error("offline")) : defaultGet(url)
    );
    render(<ExpensesPage />);

    const totals = await screen.findByRole("region", { name: "Totals" });
    expect(toastMock).toHaveBeenCalledWith("Failed to load expenses", "error");
    expect(within(totals).getByText("Not available")).toBeInTheDocument();
    expect(within(totals).queryByRole("img", { name: /company paid/i })).not.toBeInTheDocument();
    expect(totals.querySelector(".animate-pulse")).toBeNull();
  });

  it("shows the pocket and company shares of a split expense in its own currency", async () => {
    listedExpenses = [expense, splitExpense];
    render(<ExpensesPage />);

    fireEvent.click(await screen.findByText("Team offsite hotel"));
    expect(await screen.findByText("Split · $40.00 pocket / $60.00 company")).toBeInTheDocument();

    fireEvent.click(screen.getByText("AWS India Cloud Services"));
    expect(await screen.findByText("Company account")).toBeInTheDocument();
  });

  it("exports pocket and company base-currency columns", async () => {
    listedExpenses = [expense, splitExpense];
    render(<ExpensesPage />);

    fireEvent.click(await screen.findByRole("button", { name: /^export/i }));
    await waitFor(() => expect(downloadCsv).toHaveBeenCalledTimes(1));

    const [header, companyRow, splitRow] = vi.mocked(downloadCsv).mock.calls[0][1].split("\r\n");
    expect(header).toBe(
      "Date,Title,Amount,GST,Currency,Amount (Base),Category,Department,Paid From,Submitted By,Description,Pocket (Base),Company (Base),Payments,Trip,Travel Type,Approval status,Rejection reason"
    );
    expect(companyRow).toMatch(/,0,5678\.76,,,,Approved,$/);
    expect(companyRow).toContain(",Company account,");
    expect(splitRow).toContain(",USD,8350,");
    expect(splitRow).toMatch(/,3340,5010,,,,Approved,$/);
    expect(splitRow).toContain(",Split,");
    // The export is always the flat filtered list, never trip clusters.
    const exportUrl = expenseRequests().find((url) => url.includes("limit=10000"));
    expect(exportUrl).toBeDefined();
    expect(exportUrl).not.toContain("groupTrips");
  });

  it("exports every page of a list longer than one export request", async () => {
    mockExpensePages({
      "": { expenses: [expense], pagination: { total: 2, hasMore: true, nextCursor: "after-aws" } },
      "after-aws": { expenses: [splitExpense], pagination: { hasMore: false, nextCursor: null } },
    });
    render(<ExpensesPage />);

    fireEvent.click(await screen.findByRole("button", { name: /^export/i }));
    await waitFor(() => expect(downloadCsv).toHaveBeenCalledTimes(1));

    const exportUrls = expenseRequests().filter((url) => url.includes("limit=10000"));
    expect(exportUrls).toHaveLength(2);
    expect(new URL(exportUrls[0], "http://localhost").searchParams.get("cursor")).toBeNull();
    expect(new URL(exportUrls[1], "http://localhost").searchParams.get("cursor")).toBe("after-aws");
    const lines = vi.mocked(downloadCsv).mock.calls[0][1].split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("AWS India Cloud Services");
    expect(lines[2]).toContain("Team offsite hotel");
    expect(toastMock).toHaveBeenCalledWith("Exported 2 approved expenses");
  });

  it("fails the export rather than cut it short when the server gives no cursor to continue from", async () => {
    mockExpensePages({
      "": { expenses: [expense], pagination: { total: 2, hasMore: true, nextCursor: null } },
    });
    render(<ExpensesPage />);

    fireEvent.click(await screen.findByRole("button", { name: /^export/i }));
    await waitFor(() => expect(toastMock).toHaveBeenCalledWith("Failed to export expenses", "error"));
    expect(downloadCsv).not.toHaveBeenCalled();
  });

  it("exports approved expenses when Status is 'All statuses', and says so on the button", async () => {
    render(<ExpensesPage />);

    const button = await screen.findByRole("button", { name: "Export approved (CSV)" });
    expect(button).toHaveAttribute("title", expect.stringMatching(/pick a status to export the others/i));
    fireEvent.click(button);
    await waitFor(() => expect(downloadCsv).toHaveBeenCalledTimes(1));
    const exportUrl = expenseRequests().find((url) => url.includes("limit=10000"))!;
    expect(new URL(exportUrl, "http://localhost").searchParams.get("approval")).toBe("approved");
    expect(vi.mocked(downloadCsv).mock.calls[0][0]).toMatch(/^expenses-approved-/);
    // The list itself still shows every status.
    expect(new URL(expenseRequests()[0], "http://localhost").searchParams.get("approval")).toBeNull();
  });

  it("exports the picked status, and nothing approved-only, once a Status is chosen", async () => {
    window.history.replaceState(null, "", "/dashboard/expenses?approval=pending");
    render(<ExpensesPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Export CSV" }));
    await waitFor(() => expect(downloadCsv).toHaveBeenCalledTimes(1));
    const exportUrl = expenseRequests().find((url) => url.includes("limit=10000"))!;
    expect(new URL(exportUrl, "http://localhost").searchParams.getAll("approval")).toEqual(["pending"]);
    expect(toastMock).toHaveBeenCalledWith("Exported 1 expense");
  });

  it("says there's nothing approved to export rather than download an empty file", async () => {
    const defaultGet = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation((url: string) =>
      url.includes("limit=10000")
        ? Promise.resolve({ expenses: [], pagination: { total: 0, hasMore: false, nextCursor: null } })
        : defaultGet(url)
    );
    render(<ExpensesPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Export approved (CSV)" }));
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith("No approved expenses to export. Pick a Status to export the others.", "info")
    );
    expect(downloadCsv).not.toHaveBeenCalled();
  });

  it("drops a Load more page that lands after the view changed", async () => {
    window.history.replaceState(null, "", "/dashboard/expenses?view=flat");
    let releaseMore!: () => void;
    const defaultGet = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (!url.startsWith("/api/expenses")) return defaultGet(url);
      const params = new URL(url, "http://localhost").searchParams;
      if (params.get("cursor") === "after-aws") {
        // The flat list's second page, held until the grouped list has loaded.
        return new Promise((resolve) => {
          releaseMore = () =>
            resolve({ expenses: [hotelExpense], pagination: { hasMore: true, nextCursor: "after-hotel" } });
        });
      }
      if (params.get("groupTrips") === "true") {
        return Promise.resolve({
          expenses: [splitExpense],
          trips: {},
          pagination: { total: 1, hasMore: false, nextCursor: null },
          summary: listedSummary,
        });
      }
      return Promise.resolve({
        expenses: [expense],
        pagination: { total: 2, hasMore: true, nextCursor: "after-aws" },
        summary: listedSummary,
      });
    });
    render(<ExpensesPage />);

    expect(await screen.findByText("Showing 1 of 2 expenses")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(lastCursor()).toBe("after-aws"));

    fireEvent.click(screen.getByRole("switch", { name: /group trips/i }));
    expect(await screen.findByText("Team offsite hotel")).toBeInTheDocument();
    expect(screen.getByText("Showing 1 of 1 item · each trip counts as one")).toBeInTheDocument();

    await act(async () => releaseMore());

    // The flat list's page isn't appended, nor do its cursor and "more" carry over.
    expect(screen.queryByText("Beach hotel")).not.toBeInTheDocument();
    expect(screen.queryByText("AWS India Cloud Services")).not.toBeInTheDocument();
    expect(screen.getByText("Showing 1 of 1 item · each trip counts as one")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /load more|loading/i })).not.toBeInTheDocument();
  });

  it("filters by payer and shows that person's own share", async () => {
    const defaultGet = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.startsWith("/api/expenses")) {
        const paidBy = new URL(url, "http://localhost").searchParams.get("paidBy");
        return Promise.resolve({
          expenses: listedExpenses,
          pagination: { page: 1, limit: 25, total: listedExpenses.length, pages: 1 },
          summary: {
            totalAmount: 5678.76,
            totalExpenses: 1,
            ...(paidBy ? { payerSpend: { totalSpend: 1200, pocketSpend: 1000, companySpend: 200 } } : {}),
          },
        });
      }
      return defaultGet(url);
    });
    render(<ExpensesPage />);

    const payerFilter = await screen.findByRole("combobox", { name: "Paid by" });
    await waitFor(() => expect(within(payerFilter).getByRole("option", { name: "Manas Nilorout" })).toBeInTheDocument());
    fireEvent.change(payerFilter, { target: { value: "user-1" } });

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/expenses\?.*paidBy=user-1/))
    );
    expect(await screen.findByText(byAmount("₹1,200.00"))).toBeInTheDocument();
    expect(screen.getByText(/₹1,000\.00 pocket/)).toBeInTheDocument();
    expect(window.location.search).toContain("paidBy=user-1");
  });
  describe("approval", () => {
    const pendingExpense = {
      ...expense,
      _id: "pending-1",
      title: "Taxi to client",
      amount: 450,
      amountInBaseCurrency: 450,
      approvalStatus: "pending",
    };
    const rejectedExpense = {
      ...expense,
      _id: "rejected-1",
      title: "Team lunch",
      amount: 900,
      amountInBaseCurrency: 900,
      approvalStatus: "rejected",
      rejectionReason: "Receipt missing",
    };

    beforeEach(() => {
      listedExpenses = [expense, pendingExpense, rejectedExpense];
      listedSummary = { ...DEFAULT_SUMMARY, pendingCount: 1, pendingAmount: 450, rejectedCount: 1 };
    });

    it("keeps the headline to approved spend and shows what's awaiting approval beside it", async () => {
      render(<ExpensesPage />);

      const totals = await screen.findByRole("region", { name: "Totals" });
      expect(statValue(totals, "All time total")).toBe("₹5,678.76");
      expect(within(totals).getByText("1 approved expense")).toBeInTheDocument();
      expect(statValue(totals, "Awaiting approval")).toBe("₹450.00");
      expect(within(totals).getByText("1 expense · not in total")).toBeInTheDocument();
      // Admins review them in the queue.
      expect(within(totals).getByRole("link", { name: "Review expenses awaiting approval" })).toHaveAttribute(
        "href",
        "/dashboard/approvals"
      );
      // The rejected link is for submitters.
      expect(within(totals).queryByRole("button", { name: /rejected — see why/ })).not.toBeInTheDocument();
    });

    it("hides the awaiting-approval stat when nothing is waiting", async () => {
      listedSummary = { ...DEFAULT_SUMMARY, pendingCount: 0, pendingAmount: 0, rejectedCount: 0 };
      render(<ExpensesPage />);

      const totals = await screen.findByRole("region", { name: "Totals" });
      expect(within(totals).queryByText("Awaiting approval")).not.toBeInTheDocument();
    });

    it("lets a user show their pending expenses, and see why others were rejected", async () => {
      vi.mocked(useAuth).mockReturnValue({ isAdmin: false } as any);
      render(<ExpensesPage />);

      const totals = await screen.findByRole("region", { name: "Totals" });
      expect(within(totals).queryByRole("link", { name: /review/i })).not.toBeInTheDocument();

      fireEvent.click(within(totals).getByRole("button", { name: "Show them: expenses awaiting approval" }));
      await waitFor(() => expect(expenseRequests().at(-1)).toContain("approval=pending"));
      expect(window.location.search).toContain("approval=pending");
      expect(screen.getByRole("combobox", { name: "Status" })).toHaveValue("pending");

      fireEvent.click(within(totals).getByRole("button", { name: "1 rejected — see why" }));
      await waitFor(() => expect(expenseRequests().at(-1)).toContain("approval=rejected"));
      expect(window.location.search).toContain("approval=rejected");
      expect(screen.getByRole("button", { name: /^Status: Rejected\s*\(remove\)$/ })).toBeInTheDocument();
      // Already showing them: no link to itself.
      expect(within(totals).queryByRole("button", { name: /rejected — see why/ })).not.toBeInTheDocument();
    });

    it("restores the Status filter from ?approval= and sends it with the list and the export", async () => {
      window.history.replaceState(null, "", "/dashboard/expenses?approval=rejected");
      render(<ExpensesPage />);

      const status = await screen.findByRole("combobox", { name: "Status" });
      expect(status).toHaveValue("rejected");
      expect(expenseRequests()[0]).toContain("approval=rejected");
      const totals = screen.getByRole("region", { name: "Totals" });
      expect(within(totals).getByText("1 approved expense · rejected expenses aren't in totals")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
      await waitFor(() => expect(downloadCsv).toHaveBeenCalledTimes(1));
      expect(expenseRequests().find((url) => url.includes("limit=10000"))).toContain("approval=rejected");

      // Removing the chip shows every status again.
      fireEvent.click(screen.getByRole("button", { name: /^Status: Rejected\s*\(remove\)$/ }));
      await waitFor(() => expect(expenseRequests().at(-1)).not.toContain("approval="));
      expect(status).toHaveValue("");
      expect(window.location.search).not.toContain("approval");
    });

    it("ignores an unknown ?approval= value", async () => {
      window.history.replaceState(null, "", "/dashboard/expenses?approval=maybe");
      render(<ExpensesPage />);

      expect(await screen.findByRole("combobox", { name: "Status" })).toHaveValue("");
      expect(expenseRequests()[0]).not.toContain("approval=");
    });

    it("filters by status from the select and remembers it in the URL", async () => {
      render(<ExpensesPage />);

      const status = await screen.findByRole("combobox", { name: "Status" });
      expect(within(status).getAllByRole("option").map((o) => o.textContent)).toEqual([
        "All statuses",
        "Approved",
        "Awaiting approval",
        "Rejected",
      ]);
      fireEvent.change(status, { target: { value: "approved" } });
      await waitFor(() => expect(expenseRequests().at(-1)).toContain("approval=approved"));
      expect(window.location.search).toContain("approval=approved");
    });

    it("moves a deleted pending expense out of the awaiting-approval stat, not the total", async () => {
      render(<ExpensesPage />);

      const totals = await screen.findByRole("region", { name: "Totals" });
      fireEvent.click(screen.getByRole("button", { name: "Delete Taxi to client" }));

      expect(statValue(totals, "All time total")).toBe("₹5,678.76");
      expect(within(totals).getByText("1 approved expense")).toBeInTheDocument();
      expect(within(totals).getByRole("img", { name: "Company paid 100.0%, pocket 0.0%" })).toBeInTheDocument();
      // The last pending one gone: the stat goes with it.
      expect(within(totals).queryByText("Awaiting approval")).not.toBeInTheDocument();

      act(() => toastMock.mock.calls.at(-1)?.[2]?.action.onClick());
      expect(statValue(totals, "Awaiting approval")).toBe("₹450.00");
      expect(within(totals).getByText("1 expense · not in total")).toBeInTheDocument();
      expect(statValue(totals, "All time total")).toBe("₹5,678.76");
    });

    it("counts a deleted rejected expense out of the rejected link only", async () => {
      vi.mocked(useAuth).mockReturnValue({ isAdmin: false, user: { _id: "user-1", name: "Manas Nilorout", role: "user" } } as any);
      render(<ExpensesPage />);

      const totals = await screen.findByRole("region", { name: "Totals" });
      expect(within(totals).getByRole("button", { name: "1 rejected — see why" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Delete Team lunch" }));

      expect(within(totals).queryByRole("button", { name: /rejected — see why/ })).not.toBeInTheDocument();
      expect(statValue(totals, "All time total")).toBe("₹5,678.76");
      expect(statValue(totals, "Awaiting approval")).toBe("₹450.00");

      act(() => toastMock.mock.calls.at(-1)?.[2]?.action.onClick());
      expect(within(totals).getByRole("button", { name: "1 rejected — see why" })).toBeInTheDocument();
    });

    it("still takes an approved expense out of the total", async () => {
      render(<ExpensesPage />);

      const totals = await screen.findByRole("region", { name: "Totals" });
      fireEvent.click(screen.getByRole("button", { name: "Delete AWS India Cloud Services" }));

      expect(statValue(totals, "All time total")).toBe("₹0.00");
      expect(within(totals).getByText("0 approved expenses")).toBeInTheDocument();
      expect(statValue(totals, "Awaiting approval")).toBe("₹450.00");
    });
  });

  describe("review actions", () => {
    const taxi = {
      ...expense,
      _id: "pending-1",
      title: "Taxi to client",
      amount: 450,
      amountInBaseCurrency: 450,
      approvalStatus: "pending",
      assetAllocationRevision: 0,
      createdBy: { _id: "user-2", name: "Asha Rao", email: "asha@example.com" },
    };
    const admin = { _id: "admin-1", name: "Priya", email: "priya@example.com", role: "admin" };

    /** The open expense's detail (inline under its row at this width). */
    const detail = (_id: string) => document.getElementById("expense-detail-panel")!;

    beforeEach(() => {
      listedExpenses = [expense, taxi];
      listedSummary = { ...DEFAULT_SUMMARY, pendingCount: 1, pendingAmount: 450, rejectedCount: 0 };
      vi.mocked(useAuth).mockReturnValue({ isAdmin: true, user: admin } as any);
    });

    it("approving from the detail moves the amount from Awaiting approval into the total", async () => {
      vi.mocked(api.post).mockResolvedValue({
        expense: { ...taxi, approvalStatus: "approved", reviewedBy: { _id: "admin-1", name: "Priya" }, reviewedAt: "2026-11-25T10:00:00.000Z" },
      });
      render(<ExpensesPage />);
      const totals = await screen.findByRole("region", { name: "Totals" });
      expect(statValue(totals, "Awaiting approval")).toBe("₹450.00");

      fireEvent.click(screen.getByRole("button", { name: "Taxi to client" }));
      vi.useFakeTimers();
      fireEvent.click(within(detail("pending-1")).getByRole("button", { name: "Approve" }));

      // In the band straight away, with Undo; the request waits for the window.
      expect(statValue(totals, "All time total")).toBe("₹6,128.76");
      expect(within(totals).getByText("2 approved expenses")).toBeInTheDocument();
      expect(within(totals).queryByText("Awaiting approval")).not.toBeInTheDocument();
      expect(toastMock).toHaveBeenLastCalledWith('Approved "Taxi to client"', "success", expect.objectContaining({ durationMs: 5000 }));
      expect(api.post).not.toHaveBeenCalled();

      await lapseUndoWindow();
      expect(api.post).toHaveBeenCalledWith("/api/expenses/pending-1/approval", { action: "approve", revision: 0 });
      expect(statValue(totals, "All time total")).toBe("₹6,128.76");
      expect(within(totals).queryByText("Awaiting approval")).not.toBeInTheDocument();
      const ledger = screen.getByRole("region", { name: "Expense ledger" });
      expect(within(ledger).queryByText("Awaiting approval")).not.toBeInTheDocument();
      // Who approved it and when (the detail words it; the date format is the detail's own).
      expect(detail("pending-1")).toHaveTextContent(/Approved.*Priya.*25 Nov/);
    });

    it("puts everything back on Undo", async () => {
      render(<ExpensesPage />);
      const totals = await screen.findByRole("region", { name: "Totals" });
      fireEvent.click(screen.getByRole("button", { name: "Taxi to client" }));
      vi.useFakeTimers();
      fireEvent.click(within(detail("pending-1")).getByRole("button", { name: "Approve" }));
      expect(statValue(totals, "All time total")).toBe("₹6,128.76");

      act(() => toastMock.mock.calls.at(-1)![2].action.onClick());
      expect(statValue(totals, "All time total")).toBe("₹5,678.76");
      expect(statValue(totals, "Awaiting approval")).toBe("₹450.00");
      expect(within(detail("pending-1")).getByRole("button", { name: "Approve" })).toBeEnabled();
      await lapseUndoWindow();
      expect(api.post).not.toHaveBeenCalled();
    });

    it("keeps a rejected expense out of the totals and badges it", async () => {
      vi.mocked(api.post).mockResolvedValue({
        expense: { ...taxi, approvalStatus: "rejected", rejectionReason: "Duplicate" },
      });
      render(<ExpensesPage />);
      const totals = await screen.findByRole("region", { name: "Totals" });
      fireEvent.click(screen.getByRole("button", { name: "Taxi to client" }));
      fireEvent.click(within(detail("pending-1")).getByRole("button", { name: "Reject…" }));
      const dialog = screen.getByRole("dialog", { name: "Reject expense" });
      fireEvent.click(within(dialog).getByRole("button", { name: "Duplicate" }));
      vi.useFakeTimers();
      fireEvent.click(within(dialog).getByRole("button", { name: "Reject expense" }));

      expect(statValue(totals, "All time total")).toBe("₹5,678.76");
      expect(within(totals).queryByText("Awaiting approval")).not.toBeInTheDocument();
      await lapseUndoWindow();
      expect(api.post).toHaveBeenCalledWith("/api/expenses/pending-1/approval", {
        action: "reject",
        revision: 0,
        reason: "Duplicate",
      });
      expect(statValue(totals, "All time total")).toBe("₹5,678.76");
      expect(screen.getAllByText("Rejected").length).toBeGreaterThan(0);
      expect(screen.getByText(byAmount("₹450.00"))).toHaveTextContent("(rejected, not in totals)");
    });

    it("drops an approved expense from the 'Awaiting approval' filter", async () => {
      window.history.replaceState(null, "", "/dashboard/expenses?approval=pending");
      listedExpenses = [taxi];
      listedSummary = { totalAmount: 0, totalExpenses: 0, companyAmount: 0, pocketAmount: 0, pendingCount: 1, pendingAmount: 450 };
      vi.mocked(api.post).mockResolvedValue({ expense: { ...taxi, approvalStatus: "approved" } });
      render(<ExpensesPage />);
      fireEvent.click(await screen.findByRole("button", { name: "Taxi to client" }));
      vi.useFakeTimers();
      fireEvent.click(within(detail("pending-1")).getByRole("button", { name: "Approve" }));
      expect(screen.queryByRole("button", { name: "Taxi to client" })).not.toBeInTheDocument();
      // It left the filtered set, so it isn't added to this view's total either.
      const totals = screen.getByRole("region", { name: "Totals" });
      expect(statValue(totals, "All time total")).toBe("₹0.00");

      await lapseUndoWindow();
      expect(api.post).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("button", { name: "Taxi to client" })).not.toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Nothing awaiting approval" })).toBeInTheDocument();
    });

    it("withdraws Delete while an approve can still be undone, and brings it back on Undo", async () => {
      const cab = { ...taxi, _id: "pending-2", title: "Cab home", amount: 300, amountInBaseCurrency: 300 };
      listedExpenses = [expense, taxi, cab];
      render(<ExpensesPage />);
      await screen.findByRole("region", { name: "Totals" });
      fireEvent.click(screen.getByRole("button", { name: "Taxi to client" }));
      expect(within(detail("pending-1")).getByRole("button", { name: /^Delete$/ })).toBeInTheDocument();
      vi.useFakeTimers();
      fireEvent.click(within(detail("pending-1")).getByRole("button", { name: "Approve" }));

      // Neither the row's quick action nor the detail offers it meanwhile.
      expect(screen.queryByRole("button", { name: "Delete Taxi to client" })).not.toBeInTheDocument();
      expect(within(detail("pending-1")).queryByRole("button", { name: /^Delete$/ })).not.toBeInTheDocument();
      // Other expenses can still be deleted.
      expect(screen.getByRole("button", { name: "Delete Cab home" })).toBeInTheDocument();

      act(() => toastMock.mock.calls.at(-1)![2].action.onClick());
      expect(screen.getByRole("button", { name: "Delete Taxi to client" })).toBeInTheDocument();
      await lapseUndoWindow();
      expect(api.delete).not.toHaveBeenCalled();
      expect(api.post).not.toHaveBeenCalled();
    });

    it("keeps focus on the expense's row after Approve turns itself off", async () => {
      render(<ExpensesPage />);
      await screen.findByRole("region", { name: "Totals" });
      fireEvent.click(screen.getByRole("button", { name: "Taxi to client" }));
      const approve = within(detail("pending-1")).getByRole("button", { name: "Approve" });
      approve.focus();
      vi.useFakeTimers();
      fireEvent.click(approve);
      await act(async () => {
        vi.advanceTimersByTime(0);
      });

      // Approve is off (or gone) during the undo window; focus didn't drop to the page.
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Taxi to client" }));
    });

    it("moves focus to the ledger when the approved row leaves the Status filter", async () => {
      window.history.replaceState(null, "", "/dashboard/expenses?approval=pending");
      listedExpenses = [taxi];
      listedSummary = { totalAmount: 0, totalExpenses: 0, companyAmount: 0, pocketAmount: 0, pendingCount: 1, pendingAmount: 450 };
      render(<ExpensesPage />);
      fireEvent.click(await screen.findByRole("button", { name: "Taxi to client" }));
      const approve = within(detail("pending-1")).getByRole("button", { name: "Approve" });
      approve.focus();
      vi.useFakeTimers();
      fireEvent.click(approve);
      await act(async () => {
        vi.advanceTimersByTime(0);
      });

      expect(document.activeElement).toBe(screen.getByRole("region", { name: "Expense ledger" }));
    });

    it("moves an expense moved back to review out of the total and into Awaiting approval", async () => {
      const approvedTaxi = {
        ...taxi,
        approvalStatus: "approved",
        reviewedBy: { _id: "admin-2", name: "Ravi" },
        reviewedAt: "2026-11-20T10:00:00.000Z",
        assetAllocationRevision: 2,
      };
      listedExpenses = [expense, approvedTaxi];
      listedSummary = {
        totalAmount: 6128.76,
        totalExpenses: 2,
        companyAmount: 6128.76,
        pocketAmount: 0,
        pendingCount: 0,
        pendingAmount: 0,
        rejectedCount: 0,
      };
      vi.mocked(api.post).mockResolvedValue({
        expense: { ...approvedTaxi, approvalStatus: "pending", reviewedBy: null, reviewedAt: null, assetAllocationRevision: 3 },
      });
      render(<ExpensesPage />);
      const totals = await screen.findByRole("region", { name: "Totals" });
      expect(statValue(totals, "All time total")).toBe("₹6,128.76");
      expect(within(totals).queryByText("Awaiting approval")).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Taxi to client" }));
      fireEvent.click(within(detail("pending-1")).getByRole("button", { name: /move back to review/i }));
      const dialog = screen.getByRole("dialog", { name: "Move back to review" });
      fireEvent.click(within(dialog).getByRole("button", { name: "Move back to review" }));

      await waitFor(() =>
        expect(api.post).toHaveBeenCalledWith("/api/expenses/pending-1/approval", expect.objectContaining({ action: "reopen", revision: 2 }))
      );
      await waitFor(() => expect(statValue(totals, "All time total")).toBe("₹5,678.76"));
      expect(within(totals).getByText("1 approved expense")).toBeInTheDocument();
      expect(statValue(totals, "Awaiting approval")).toBe("₹450.00");
      expect(within(totals).getByText("1 expense · not in total")).toBeInTheDocument();
      // Still listed (no Status filter), now badged.
      const ledger = screen.getByRole("region", { name: "Expense ledger" });
      expect(within(ledger).getAllByText("Awaiting approval").length).toBeGreaterThan(0);
    });

    it("drops a reopened expense from the 'Approved' filter, and from its total", async () => {
      window.history.replaceState(null, "", "/dashboard/expenses?approval=approved");
      const approvedTaxi = { ...taxi, approvalStatus: "approved", assetAllocationRevision: 2 };
      listedExpenses = [expense, approvedTaxi];
      listedSummary = { totalAmount: 6128.76, totalExpenses: 2, companyAmount: 6128.76, pocketAmount: 0, pendingCount: 0, pendingAmount: 0 };
      vi.mocked(api.post).mockResolvedValue({ expense: { ...approvedTaxi, approvalStatus: "pending" } });
      render(<ExpensesPage />);
      const totals = await screen.findByRole("region", { name: "Totals" });

      fireEvent.click(screen.getByRole("button", { name: "Taxi to client" }));
      fireEvent.click(within(detail("pending-1")).getByRole("button", { name: /move back to review/i }));
      fireEvent.click(within(screen.getByRole("dialog", { name: "Move back to review" })).getByRole("button", { name: "Move back to review" }));

      await waitFor(() => expect(screen.queryByRole("button", { name: "Taxi to client" })).not.toBeInTheDocument());
      expect(statValue(totals, "All time total")).toBe("₹5,678.76");
      expect(screen.getByText("Showing 1 of 1 item · each trip counts as one")).toBeInTheDocument();
    });

    it("puts focus on the expense's row after Move back to review, whose button is gone", async () => {
      const approvedTaxi = { ...taxi, approvalStatus: "approved", assetAllocationRevision: 2 };
      listedExpenses = [expense, approvedTaxi];
      vi.mocked(api.post).mockResolvedValue({ expense: { ...approvedTaxi, approvalStatus: "pending", assetAllocationRevision: 3 } });
      render(<ExpensesPage />);
      await screen.findByRole("region", { name: "Totals" });

      fireEvent.click(screen.getByRole("button", { name: "Taxi to client" }));
      const reopen = within(detail("pending-1")).getByRole("button", { name: /move back to review/i });
      reopen.focus();
      fireEvent.click(reopen);
      const dialog = screen.getByRole("dialog", { name: "Move back to review" });
      fireEvent.click(within(dialog).getByRole("button", { name: "Move back to review" }));

      await waitFor(() => expect(screen.queryByRole("dialog", { name: "Move back to review" })).not.toBeInTheDocument());
      // Its opener only shows on a reviewed expense, so it's gone: focus lands on the row, not the page.
      expect(within(detail("pending-1")).queryByRole("button", { name: /move back to review/i })).not.toBeInTheDocument();
      await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Taxi to client" })));
    });

    it("moves focus to the ledger when the expense moved back to review leaves the Status filter", async () => {
      window.history.replaceState(null, "", "/dashboard/expenses?approval=approved");
      const approvedTaxi = { ...taxi, approvalStatus: "approved", assetAllocationRevision: 2 };
      listedExpenses = [expense, approvedTaxi];
      listedSummary = { totalAmount: 6128.76, totalExpenses: 2, companyAmount: 6128.76, pocketAmount: 0, pendingCount: 0, pendingAmount: 0 };
      vi.mocked(api.post).mockResolvedValue({ expense: { ...approvedTaxi, approvalStatus: "pending" } });
      render(<ExpensesPage />);

      fireEvent.click(await screen.findByRole("button", { name: "Taxi to client" }));
      const reopen = within(detail("pending-1")).getByRole("button", { name: /move back to review/i });
      reopen.focus();
      fireEvent.click(reopen);
      fireEvent.click(within(screen.getByRole("dialog", { name: "Move back to review" })).getByRole("button", { name: "Move back to review" }));

      await waitFor(() => expect(screen.queryByRole("button", { name: "Taxi to client" })).not.toBeInTheDocument());
      await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("region", { name: "Expense ledger" })));
    });

    it("lets the submitter resubmit a rejected expense as is", async () => {
      const lunch = {
        ...expense,
        _id: "rejected-1",
        title: "Team lunch",
        amount: 900,
        amountInBaseCurrency: 900,
        approvalStatus: "rejected",
        rejectionReason: "Receipt missing",
        reviewedBy: { _id: "admin-1", name: "Priya" },
        reviewedAt: "2026-11-20T10:00:00.000Z",
        assetAllocationRevision: 3,
      };
      listedExpenses = [expense, lunch];
      listedSummary = { ...DEFAULT_SUMMARY, pendingCount: 0, pendingAmount: 0, rejectedCount: 1 };
      vi.mocked(useAuth).mockReturnValue({
        isAdmin: false,
        user: { _id: "user-1", name: "Manas Nilorout", email: "manas@example.com", role: "user" },
      } as any);
      vi.mocked(api.post).mockResolvedValue({ expense: { ...lunch, approvalStatus: "pending", rejectionReason: null } });

      render(<ExpensesPage />);
      const totals = await screen.findByRole("region", { name: "Totals" });
      expect(within(totals).getByRole("button", { name: "1 rejected — see why" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Team lunch" }));
      const notice = within(detail("rejected-1"));
      expect(notice.getByText("Receipt missing")).toBeInTheDocument();
      expect(notice.getByRole("link", { name: "Edit & resubmit" })).toHaveAttribute("href", "/dashboard/expenses/rejected-1/edit");
      const resubmit = notice.getByRole("button", { name: "Resubmit as is…" });
      resubmit.focus();
      fireEvent.click(resubmit);

      const dialog = screen.getByRole("dialog", { name: "Resubmit for approval" });
      fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "Receipt attached now" } });
      fireEvent.click(within(dialog).getByRole("button", { name: "Resubmit" }));

      await waitFor(() => expect(screen.queryByRole("dialog", { name: "Resubmit for approval" })).not.toBeInTheDocument());
      expect(api.post).toHaveBeenCalledWith("/api/expenses/rejected-1/approval", {
        action: "resubmit",
        revision: 3,
        note: "Receipt attached now",
      });
      expect(toastMock).toHaveBeenCalledWith("Resubmitted. An admin will review it again.");
      expect(statValue(totals, "Awaiting approval")).toBe("₹900.00");
      expect(within(totals).queryByRole("button", { name: /rejected — see why/ })).not.toBeInTheDocument();
      expect(statValue(totals, "All time total")).toBe("₹5,678.76");
      expect(within(detail("rejected-1")).getByText(/An admin will review this/)).toBeInTheDocument();
      // "Resubmit as is…" is gone with the rejection: focus goes to the row rather than the page.
      await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Team lunch" })));
    });

    describe("shared bills", () => {
      const manas = { _id: "user-1", name: "Manas Nilorout", email: "manas@example.com" };
      const ravi = { _id: "user-2", name: "Ravi", email: "ravi@example.com" };
      // ₹1,000 split: Manas ₹350 from pocket, Ravi ₹650 on the company card.
      const shared = (overrides: Record<string, unknown>) => ({
        ...expense,
        amount: 1000,
        amountInBaseCurrency: 1000,
        paymentSource: "multiple",
        pocketAmount: 350,
        pocketAmountInBaseCurrency: 350,
        payments: [
          { paidBy: manas, amount: 350, amountInBaseCurrency: 350, source: "pocket" },
          { paidBy: ravi, amount: 650, amountInBaseCurrency: 650, source: "company" },
        ],
        assetAllocationRevision: 2,
        ...overrides,
      });

      it("moves only the user's own share into Awaiting approval when they resubmit their shared bill", async () => {
        const rejected = shared({
          _id: "shared-1",
          title: "Offsite cab",
          createdBy: manas,
          approvalStatus: "rejected",
          rejectionReason: "Receipt missing",
        });
        listedExpenses = [expense, rejected];
        listedSummary = { ...DEFAULT_SUMMARY, pendingCount: 0, pendingAmount: 0, rejectedCount: 1 };
        vi.mocked(useAuth).mockReturnValue({ isAdmin: false, user: { ...manas, role: "user" } } as any);
        vi.mocked(api.post).mockResolvedValue({ expense: { ...rejected, approvalStatus: "pending", rejectionReason: null } });

        render(<ExpensesPage />);
        const totals = await screen.findByRole("region", { name: "Totals" });
        fireEvent.click(screen.getByRole("button", { name: "Offsite cab" }));
        fireEvent.click(within(detail("shared-1")).getByRole("button", { name: "Resubmit as is…" }));
        fireEvent.click(within(screen.getByRole("dialog", { name: "Resubmit for approval" })).getByRole("button", { name: "Resubmit" }));

        await waitFor(() => expect(statValue(totals, "Awaiting approval")).toBe("₹350.00"));
        expect(statValue(totals, "All time total")).toBe("₹5,678.76");
        expect(within(totals).queryByRole("button", { name: /rejected — see why/ })).not.toBeInTheDocument();
      });

      it("shows a payer someone else's pending shared bill with its status, read-only", async () => {
        const pending = shared({ _id: "shared-2", title: "Hotel deposit", createdBy: ravi, approvalStatus: "pending" });
        const rejected = shared({
          _id: "shared-3",
          title: "Team dinner",
          createdBy: ravi,
          approvalStatus: "rejected",
          rejectionReason: "Over the limit",
        });
        listedExpenses = [expense, pending, rejected];
        // Manas's share of the pending bill only.
        listedSummary = { ...DEFAULT_SUMMARY, pendingCount: 1, pendingAmount: 350, rejectedCount: 1 };
        vi.mocked(useAuth).mockReturnValue({ isAdmin: false, user: { ...manas, role: "user" } } as any);

        render(<ExpensesPage />);
        const totals = await screen.findByRole("region", { name: "Totals" });
        expect(statValue(totals, "Awaiting approval")).toBe("₹350.00");

        expect(screen.queryByRole("button", { name: "Delete Hotel deposit" })).not.toBeInTheDocument();
        expect(screen.queryByLabelText("Edit Hotel deposit")).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Hotel deposit" }));
        const pendingDetail = within(detail("shared-2"));
        expect(pendingDetail.getByText("Awaiting approval")).toBeInTheDocument();
        expect(pendingDetail.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
        expect(pendingDetail.queryByRole("link", { name: /^Edit/ })).not.toBeInTheDocument();
        expect(pendingDetail.queryByRole("button", { name: /^Delete$/ })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Team dinner" }));
        const rejectedDetail = within(detail("shared-3"));
        expect(rejectedDetail.getByText("Over the limit")).toBeInTheDocument();
        expect(rejectedDetail.queryByRole("button", { name: "Resubmit as is…" })).not.toBeInTheDocument();
        expect(rejectedDetail.queryByRole("link", { name: /Edit/ })).not.toBeInTheDocument();
        expect(rejectedDetail.queryByRole("button", { name: /^Delete$/ })).not.toBeInTheDocument();
        expect(rejectedDetail.getByText(/Ravi can fix it and resubmit/)).toBeInTheDocument();
      });
    });
  });

  describe("delete permissions", () => {
    const LOCKED = "Approved expenses are part of the books, so only the master admin can delete them.";
    const manas = { _id: "user-1", name: "Manas Nilorout", email: "manas@example.com" };
    // `expense` (AWS) is Manas's, legacy: no status, so approved.
    const taxi = {
      ...expense,
      _id: "pending-1",
      title: "Taxi to client",
      amount: 450,
      amountInBaseCurrency: 450,
      approvalStatus: "pending",
      assetAllocationRevision: 0,
    };
    const lunch = {
      ...expense,
      _id: "rejected-1",
      title: "Team lunch",
      amount: 900,
      amountInBaseCurrency: 900,
      approvalStatus: "rejected",
      rejectionReason: "Receipt missing",
    };
    const approvedDinner = { ...expense, _id: "approved-1", title: "Client dinner", amount: 1200, amountInBaseCurrency: 1200, approvalStatus: "approved" };
    const detail = () => document.getElementById("expense-detail-panel")!;

    beforeEach(() => {
      listedExpenses = [expense, approvedDinner, taxi, lunch];
      listedSummary = {
        totalAmount: 6878.76,
        totalExpenses: 2,
        companyAmount: 6878.76,
        pocketAmount: 0,
        pendingCount: 1,
        pendingAmount: 450,
        rejectedCount: 1,
      };
      vi.mocked(useAuth).mockReturnValue({ isAdmin: false, user: { ...manas, role: "user" } } as any);
    });

    it("lets a user delete their own pending or rejected expense, and explains why not on an approved one", async () => {
      render(<ExpensesPage />);
      await screen.findByRole("region", { name: "Totals" });

      expect(screen.getByRole("button", { name: "Delete Taxi to client" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Delete Team lunch" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Delete Client dinner" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Delete AWS India Cloud Services" })).not.toBeInTheDocument();

      for (const title of ["Client dinner", "AWS India Cloud Services"]) {
        fireEvent.click(screen.getByRole("button", { name: title }));
        expect(within(detail()).queryByRole("button", { name: /^Delete$/ })).not.toBeInTheDocument();
        expect(within(detail()).getByText(LOCKED)).toBeInTheDocument();
      }

      fireEvent.click(screen.getByRole("button", { name: "Taxi to client" }));
      expect(within(detail()).getByRole("button", { name: /^Delete$/ })).toBeInTheDocument();
      expect(within(detail()).queryByText(LOCKED)).not.toBeInTheDocument();
    });

    it("gives an admin the same rule on someone else's approved expense", async () => {
      vi.mocked(useAuth).mockReturnValue({
        isAdmin: true,
        user: { _id: "admin-1", name: "Priya", email: "priya@example.com", role: "admin" },
      } as any);
      render(<ExpensesPage />);
      await screen.findByRole("region", { name: "Totals" });

      expect(screen.getByRole("button", { name: "Delete Taxi to client" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Delete Team lunch" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Delete Client dinner" })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Client dinner" }));
      expect(within(detail()).getByText(LOCKED)).toBeInTheDocument();
    });

    it("lets the master admin delete an approved expense, out of the total", async () => {
      vi.mocked(useAuth).mockReturnValue({
        isAdmin: true,
        isMasterAdmin: true,
        user: { _id: "master-1", name: "Owner", email: "owner@example.com", role: "master_admin" },
      } as any);
      render(<ExpensesPage />);
      const totals = await screen.findByRole("region", { name: "Totals" });

      fireEvent.click(screen.getByRole("button", { name: "Client dinner" }));
      expect(within(detail()).queryByText(LOCKED)).not.toBeInTheDocument();
      vi.useFakeTimers();
      fireEvent.click(within(detail()).getByRole("button", { name: /^Delete$/ }));
      expect(statValue(totals, "All time total")).toBe("₹5,678.76");

      await lapseUndoWindow();
      expect(api.delete).toHaveBeenCalledWith("/api/expenses/approved-1");
    });

    it("puts the row and the totals back when the server refuses (approved meanwhile), then shows what it has", async () => {
      vi.mocked(api.delete).mockRejectedValueOnce(new ApiError(LOCKED, 403, { error: LOCKED, code: "approved_locked" }));
      const defaultGet = vi.mocked(api.get).getMockImplementation()!;
      vi.mocked(api.get).mockImplementation((url: string) =>
        url === "/api/expenses/pending-1"
          ? Promise.resolve({ expense: { ...taxi, approvalStatus: "approved", assetAllocationRevision: 1 } })
          : defaultGet(url)
      );
      render(<ExpensesPage />);
      const totals = await screen.findByRole("region", { name: "Totals" });
      expect(statValue(totals, "Awaiting approval")).toBe("₹450.00");

      vi.useFakeTimers();
      fireEvent.click(screen.getByRole("button", { name: "Delete Taxi to client" }));
      expect(screen.queryByRole("button", { name: "Taxi to client" })).not.toBeInTheDocument();
      expect(within(totals).queryByText("Awaiting approval")).not.toBeInTheDocument();

      await lapseUndoWindow();
      vi.useRealTimers();

      expect(api.delete).toHaveBeenCalledWith("/api/expenses/pending-1");
      expect(toastMock).toHaveBeenCalledWith(LOCKED, "error");
      expect(screen.getByRole("button", { name: "Taxi to client" })).toBeInTheDocument();
      // Re-read: it is approved now, so it moves into the total, and only the master admin may delete it.
      await waitFor(() => expect(statValue(totals, "All time total")).toBe("₹7,328.76"));
      expect(within(totals).queryByText("Awaiting approval")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Delete Taxi to client" })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Taxi to client" }));
      expect(within(detail()).getByText(LOCKED)).toBeInTheDocument();
    });

    it("puts the row and its awaiting-approval figure back when the server refuses for another reason", async () => {
      vi.mocked(api.delete).mockRejectedValueOnce(new Error("offline"));
      render(<ExpensesPage />);
      const totals = await screen.findByRole("region", { name: "Totals" });

      vi.useFakeTimers();
      fireEvent.click(screen.getByRole("button", { name: "Delete Taxi to client" }));
      await lapseUndoWindow();

      expect(toastMock).toHaveBeenCalledWith("Failed to delete expense", "error");
      expect(screen.getByRole("button", { name: "Taxi to client" })).toBeInTheDocument();
      expect(statValue(totals, "Awaiting approval")).toBe("₹450.00");
      // No reason was given, so there is nothing to re-read.
      expect(api.get).not.toHaveBeenCalledWith("/api/expenses/pending-1");
    });
  });

  describe("trip clusters", () => {
    beforeEach(() => {
      listedExpenses = [flightExpense, hotelExpense, expense];
      listedTrips = { "trip-1": goaTrip };
      listedItemTotal = 2;
    });

    it("groups a trip's expenses into one row with its count and total", async () => {
      render(<ExpensesPage />);

      const cluster = await screen.findByRole("button", { name: /^Goa client visit/ });
      expect(cluster).toHaveAttribute("aria-expanded", "false");
      expect(expenseRequests()[0]).toContain("groupTrips=true");

      expect(screen.getByText("2 expenses")).toBeInTheDocument();
      expect(screen.getByText(byAmount("₹20,000.00"))).toBeInTheDocument();
      expect(screen.getByText("1 without receipt")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Open trip Goa client visit" })).toHaveAttribute(
        "href",
        "/dashboard/trips/trip-1"
      );
      // Trip expenses stay inside the collapsed cluster; the other one is its own row.
      expect(screen.queryByText("Flight to Goa")).not.toBeInTheDocument();
      expect(screen.getByText("AWS India Cloud Services")).toBeInTheDocument();
      expect(screen.getByText(/Showing 2 of 2 items/)).toBeInTheDocument();
    });

    it("drops the travellers, with their separator, from a narrow collapsed band", async () => {
      render(<ExpensesPage />);

      const cluster = await screen.findByRole("button", { name: /^Goa client visit/ });
      const names = within(cluster).getByText("Manas Nilorout").parentElement!;
      // The "·" goes with the names, so a narrow band doesn't end in a dangling separator.
      expect(names).toHaveTextContent(/^·\s*Manas Nilorout$/);
      expect(names).toHaveClass("hidden", "[@container(min-width:620px)]:flex");
    });

    it("expands into day sections, including bookings made before the trip", async () => {
      render(<ExpensesPage />);

      fireEvent.click(await screen.findByRole("button", { name: /^Goa client visit/ }));

      const timeline = screen.getByTestId("trip-timeline");
      expect(timeline).toHaveTextContent("Before the trip");
      expect(timeline).toHaveTextContent(/Day 1/);
      expect(screen.getByRole("listitem", { name: "Before the trip" })).toHaveTextContent("Flight to Goa");
      expect(screen.getByRole("listitem", { name: /^Day 1/ })).toHaveTextContent("Beach hotel");
      expect(screen.getByRole("listitem", { name: /^Day 1/ })).toHaveTextContent("₹8,000.00");

      fireEvent.click(screen.getByText("Beach hotel"));
      expect(await screen.findByText("Company account")).toBeInTheDocument();
    });

    it("switches to a flat list without groupTrips and remembers it in the URL", async () => {
      render(<ExpensesPage />);

      const toggle = await screen.findByRole("switch", { name: /group trips/i });
      expect(toggle).toHaveAttribute("aria-checked", "true");
      const requestsBefore = expenseRequests().length;
      fireEvent.click(toggle);

      await waitFor(() => expect(expenseRequests().length).toBeGreaterThan(requestsBefore));
      expect(expenseRequests().at(-1)).not.toContain("groupTrips");
      expect(await screen.findByText("Flight to Goa")).toBeInTheDocument();
      expect(screen.getByRole("switch", { name: /group trips/i })).toHaveAttribute("aria-checked", "false");
      expect(screen.queryByRole("button", { name: /^Goa client visit/ })).not.toBeInTheDocument();
      expect(screen.getAllByRole("link", { name: /Goa client visit/ })[0]).toHaveAttribute(
        "href",
        "/dashboard/trips/trip-1"
      );
      expect(screen.getByText("Showing 3 of 3 expenses")).toBeInTheDocument();
      expect(window.location.search).toContain("view=flat");
    });

    it("counts items while grouped even when no trip is on the loaded page", async () => {
      listedExpenses = [expense];
      listedTrips = {};
      listedItemTotal = 30;
      render(<ExpensesPage />);

      expect(await screen.findByText("Showing 1 of 30 items · each trip counts as one")).toBeInTheDocument();
      expect(screen.queryByText(/of 30 expenses/)).not.toBeInTheDocument();
    });

    it("starts flat when the URL says view=flat", async () => {
      window.history.replaceState(null, "", "/dashboard/expenses?view=flat");
      render(<ExpensesPage />);

      expect(await screen.findByText("Flight to Goa")).toBeInTheDocument();
      expect(expenseRequests().every((url) => !url.includes("groupTrips"))).toBe(true);
    });

    it("deletes inside a cluster, drops the cluster with its last expense, and undoes", async () => {
      render(<ExpensesPage />);

      fireEvent.click(await screen.findByRole("button", { name: /^Goa client visit/ }));
      fireEvent.click(screen.getByRole("button", { name: "Delete Flight to Goa" }));

      expect(screen.queryByText("Flight to Goa")).not.toBeInTheDocument();
      expect(screen.getByText("1 expense")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Goa client visit/ })).toHaveAccessibleName(/₹8,000\.00/);
      // The cluster is still one row.
      expect(screen.getByText(/Showing 2 of 2 items/)).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Delete Beach hotel" }));
      expect(screen.queryByRole("button", { name: /^Goa client visit/ })).not.toBeInTheDocument();
      // Still grouped, so the count is of rows, not expenses.
      expect(screen.getByText("Showing 1 of 1 item · each trip counts as one")).toBeInTheDocument();

      // Undo the last delete: the cluster comes back with that expense.
      const undo = toastMock.mock.calls.at(-1)?.[2]?.action;
      expect(undo?.label).toBe("Undo");
      act(() => undo.onClick());
      expect(screen.getByRole("button", { name: /^Goa client visit/ })).toBeInTheDocument();
      expect(screen.getByText(/Showing 2 of 2 items/)).toBeInTheDocument();
      expect(api.delete).not.toHaveBeenCalled();
    });

    it("counts a trip the viewer can't open as one item, and still offers the rest", async () => {
      // The trip's expenses come back as plain rows, but the server counts the trip once.
      mockExpensePages({
        "": {
          expenses: [flightExpense, hotelExpense, expense],
          trips: {},
          pagination: { total: 3, hasMore: true, nextCursor: "after-aws" },
        },
        "after-aws": { expenses: [splitExpense], trips: {}, pagination: { total: 3, hasMore: false, nextCursor: null } },
      });
      render(<ExpensesPage />);

      expect(await screen.findByText("Flight to Goa")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^Goa client visit/ })).not.toBeInTheDocument();
      expect(screen.getByText("Showing 2 of 3 items · each trip counts as one")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Load more" }));

      expect(await screen.findByText("Team offsite hotel")).toBeInTheDocument();
      const lastRequest = new URL(expenseRequests().at(-1)!, "http://localhost").searchParams;
      expect(lastRequest.get("cursor")).toBe("after-aws");
      expect(lastRequest.get("groupTrips")).toBe("true");
      expect(screen.getByText("Showing 3 of 3 items · each trip counts as one")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
    });

    it("counts a trip out only once its last expense is deleted, and continues after it", async () => {
      mockExpensePages({
        "": {
          expenses: [flightExpense, hotelExpense, expense],
          trips: { "trip-1": goaTrip },
          pagination: { total: 3, hasMore: true, nextCursor: "after-aws" },
        },
        "after-aws": { expenses: [splitExpense], trips: {}, pagination: { total: 2, hasMore: false, nextCursor: null } },
      });
      render(<ExpensesPage />);

      fireEvent.click(await screen.findByRole("button", { name: /^Goa client visit/ }));
      vi.useFakeTimers();
      fireEvent.click(screen.getByRole("button", { name: "Delete Flight to Goa" }));
      await lapseUndoWindow();
      // The hotel keeps the trip item listed and counted.
      expect(screen.getByText("Showing 2 of 3 items · each trip counts as one")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Delete Beach hotel" }));
      await lapseUndoWindow();
      expect(api.delete).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
      expect(screen.getByText("Showing 1 of 2 items · each trip counts as one")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Load more" }));

      expect(await screen.findByText("Team offsite hotel")).toBeInTheDocument();
      expect(lastCursor()).toBe("after-aws");
      expect(screen.getByText("Showing 2 of 2 items · each trip counts as one")).toBeInTheDocument();
    });

    it("fetches and opens an ?expand= expense that isn't on the first page, above the list", async () => {
      const older = { ...expense, _id: "expense-9", title: "Printer ink", amount: 1500, amountInBaseCurrency: 1500, approvalStatus: "pending" };
      const defaultGet = vi.mocked(api.get).getMockImplementation()!;
      vi.mocked(api.get).mockImplementation((url: string) =>
        url === "/api/expenses/expense-9" ? Promise.resolve({ expense: older, assets: [] }) : defaultGet(url)
      );
      window.history.replaceState(null, "", "/dashboard/expenses?expand=expense-9");
      render(<ExpensesPage />);

      const pinned = await screen.findByTestId("pinned-expense");
      expect(pinned).toHaveTextContent("The expense you opened · further down the list");
      const row = within(pinned).getByRole("button", { name: "Printer ink" });
      expect(row).toHaveAttribute("aria-expanded", "true");
      // Its detail is open under it, with its approval state.
      expect(pinned.querySelector("#expense-detail-panel")).toHaveTextContent("Awaiting approval");
      // The list itself is unchanged.
      expect(screen.getByText("Showing 2 of 2 items · each trip counts as one")).toBeInTheDocument();
    });

    it("moves the totals when the opened expense from a link is approved", async () => {
      const older = {
        ...expense,
        _id: "expense-9",
        title: "Printer ink",
        amount: 1500,
        amountInBaseCurrency: 1500,
        approvalStatus: "pending",
        createdBy: { _id: "user-2", name: "Asha Rao", email: "asha@example.com" },
      };
      listedSummary = { ...DEFAULT_SUMMARY, pendingCount: 1, pendingAmount: 1500, rejectedCount: 0 };
      vi.mocked(useAuth).mockReturnValue({ isAdmin: true, user: { _id: "admin-1", name: "Priya", role: "admin" } } as any);
      vi.mocked(api.post).mockResolvedValue({ expense: { ...older, approvalStatus: "approved" } });
      const defaultGet = vi.mocked(api.get).getMockImplementation()!;
      vi.mocked(api.get).mockImplementation((url: string) =>
        url === "/api/expenses/expense-9" ? Promise.resolve({ expense: older, assets: [] }) : defaultGet(url)
      );
      window.history.replaceState(null, "", "/dashboard/expenses?expand=expense-9");
      render(<ExpensesPage />);

      const pinned = await screen.findByTestId("pinned-expense");
      const totals = screen.getByRole("region", { name: "Totals" });
      vi.useFakeTimers();
      fireEvent.click(within(pinned).getByRole("button", { name: "Approve" }));
      expect(statValue(totals, "All time total")).toBe("₹7,178.76");
      expect(within(totals).queryByText("Awaiting approval")).not.toBeInTheDocument();

      await lapseUndoWindow();
      expect(api.post).toHaveBeenCalledWith("/api/expenses/expense-9/approval", { action: "approve", revision: 0 });
      expect(statValue(totals, "All time total")).toBe("₹7,178.76");
      expect(within(totals).queryByText("Awaiting approval")).not.toBeInTheDocument();
    });

    it("says so when an ?expand= expense can't be fetched", async () => {
      const defaultGet = vi.mocked(api.get).getMockImplementation()!;
      vi.mocked(api.get).mockImplementation((url: string) =>
        url === "/api/expenses/gone-1" ? Promise.reject(new Error("Expense not found")) : defaultGet(url)
      );
      window.history.replaceState(null, "", "/dashboard/expenses?expand=gone-1");
      render(<ExpensesPage />);

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith("That expense couldn't be opened. It may have been deleted.", "info")
      );
      expect(screen.queryByTestId("pinned-expense")).not.toBeInTheDocument();
    });

    it("opens the cluster and the expense for an ?expand= deep link", async () => {
      window.history.replaceState(null, "", "/dashboard/expenses?expand=expense-4");
      render(<ExpensesPage />);

      const cluster = await screen.findByRole("button", { name: /^Goa client visit/ });
      await waitFor(() => expect(cluster).toHaveAttribute("aria-expanded", "true"));
      expect(screen.getByText("Beach hotel").closest("button")).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByText("Company account")).toBeInTheDocument();
    });
  });
});
