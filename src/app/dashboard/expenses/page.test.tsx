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

function expenseRequests(): string[] {
  return vi.mocked(api.get).mock.calls.map(([url]) => url).filter((url) => url.startsWith("/api/expenses"));
}

describe("ExpensesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listedExpenses = [expense];
    listedTrips = {};
    listedItemTotal = null;
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
            page: 1,
            limit: 25,
            total: grouped && listedItemTotal !== null ? listedItemTotal : listedExpenses.length,
            pages: 1,
          },
          summary: { totalAmount: 5678.76, totalExpenses: 1, companyAmount: 5678.76, pocketAmount: 0 },
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
