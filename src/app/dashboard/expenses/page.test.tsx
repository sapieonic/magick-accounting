import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import ExpensesPage from "./page";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";

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

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    delete: vi.fn(),
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
    expect(within(totals).getByText("1 expense")).toBeInTheDocument();
    // The split comes with the list's summary, so it follows the same filters.
    expect(await within(totals).findByRole("img", { name: "Company paid 100.0%, pocket 0.0%" })).toBeInTheDocument();
    // The total, and all of it company-paid.
    expect(within(totals).getAllByText("₹5,678.76")).toHaveLength(2);
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
    expect(within(totals).getByText("0 expenses")).toBeInTheDocument();
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
    expect(within(totals).getByText("1 expense")).toBeInTheDocument();
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

    expect(within(totals).getByText("0 expenses")).toBeInTheDocument();
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

    fireEvent.click(await screen.findByRole("button", { name: /export csv/i }));
    await waitFor(() => expect(downloadCsv).toHaveBeenCalledTimes(1));

    const [header, companyRow, splitRow] = vi.mocked(downloadCsv).mock.calls[0][1].split("\r\n");
    expect(header).toBe(
      "Date,Title,Amount,GST,Currency,Amount (Base),Category,Department,Paid From,Submitted By,Description,Pocket (Base),Company (Base),Payments,Trip,Travel Type"
    );
    expect(companyRow).toMatch(/,0,5678\.76,,,$/);
    expect(companyRow).toContain(",Company account,");
    expect(splitRow).toContain(",USD,8350,");
    expect(splitRow).toMatch(/,3340,5010,,,$/);
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

    fireEvent.click(await screen.findByRole("button", { name: /export csv/i }));
    await waitFor(() => expect(downloadCsv).toHaveBeenCalledTimes(1));

    const exportUrls = expenseRequests().filter((url) => url.includes("limit=10000"));
    expect(exportUrls).toHaveLength(2);
    expect(new URL(exportUrls[0], "http://localhost").searchParams.get("cursor")).toBeNull();
    expect(new URL(exportUrls[1], "http://localhost").searchParams.get("cursor")).toBe("after-aws");
    const lines = vi.mocked(downloadCsv).mock.calls[0][1].split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("AWS India Cloud Services");
    expect(lines[2]).toContain("Team offsite hotel");
    expect(toastMock).toHaveBeenCalledWith("Exported 2 expenses");
  });

  it("fails the export rather than cut it short when the server gives no cursor to continue from", async () => {
    mockExpensePages({
      "": { expenses: [expense], pagination: { total: 2, hasMore: true, nextCursor: null } },
    });
    render(<ExpensesPage />);

    fireEvent.click(await screen.findByRole("button", { name: /export csv/i }));
    await waitFor(() => expect(toastMock).toHaveBeenCalledWith("Failed to export expenses", "error"));
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
    expect(await screen.findByText("₹1,200.00")).toBeInTheDocument();
    expect(screen.getByText(/₹1,000\.00 pocket/)).toBeInTheDocument();
    expect(window.location.search).toContain("paidBy=user-1");
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
      expect(screen.getByText("₹20,000.00")).toBeInTheDocument();
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
