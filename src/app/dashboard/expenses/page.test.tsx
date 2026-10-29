import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
  AreaChart: ({ data }: any) => <div data-testid="area-chart" data-chart-data={JSON.stringify(data)} />,
  Area: () => <div data-testid="area" />,
  XAxis: () => <div data-testid="xaxis" />,
  YAxis: () => <div data-testid="yaxis" />,
  CartesianGrid: () => <div data-testid="grid" />,
  PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
  Pie: ({ data, children }: any) => (
    <div data-testid="pie" data-pie-data={JSON.stringify(data)}>
      {children}
    </div>
  ),
  BarChart: ({ children, data }: any) => <div data-testid="bar-chart" data-chart-data={JSON.stringify(data)}>{children}</div>,
  Bar: () => <div data-testid="bar" />,
  Cell: () => <div data-testid="cell" />,
  Tooltip: () => <div data-testid="tooltip" />,
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
          summary: { totalAmount: 5678.76, totalExpenses: 1 },
        });
      }
      if (url.startsWith("/api/dashboard/charts")) {
        return Promise.resolve({
          monthlyTrend: [
            { month: "Jul", key: "2026-07", total: 5678.76, count: 1 },
          ],
          topCategories: [
            { _id: "category-1", name: "Software & Subscriptions", total: 5678.76, count: 1 },
          ],
          paymentSources: [{ name: "company", total: 5678.76, count: 1 }],
          departmentSpend: [{ _id: "department-1", name: "Engineering", total: 5678.76, count: 1 }],
        });
      }
      return Promise.resolve({});
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("gives the expenses list and analytics rail separate desktop scroll regions", async () => {
    render(<ExpensesPage />);

    const listRegion = await screen.findByLabelText("Expenses list");
    const analyticsRegion = await screen.findByLabelText("Expense analytics");

    expect(listRegion).toHaveClass("xl:overflow-y-auto");
    expect(listRegion).toHaveClass("xl:min-h-0");
    expect(analyticsRegion).toHaveClass("xl:overflow-y-auto");
    expect(analyticsRegion).toHaveClass("xl:min-h-0");
    // The rail loads its charts separately, so wait for them.
    expect(await screen.findByText("Monthly Trend")).toBeInTheDocument();
    expect(screen.getByText("Top Categories")).toBeInTheDocument();
  });

  it("refreshes analytics after a delete commits", async () => {
    render(<ExpensesPage />);

    await screen.findByText("AWS India Cloud Services");
    await waitFor(() => {
      expect(vi.mocked(api.get).mock.calls.some(([url]) => url.startsWith("/api/dashboard/charts"))).toBe(true);
    });
    const initialAnalyticsCalls = vi.mocked(api.get).mock.calls.filter(([url]) =>
      url.startsWith("/api/dashboard/charts")
    ).length;

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Delete AWS India Cloud Services" }));

    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    expect(api.delete).toHaveBeenCalledWith("/api/expenses/expense-1");
    const analyticsCalls = vi.mocked(api.get).mock.calls.filter(([url]) =>
      url.startsWith("/api/dashboard/charts")
    ).length;
    expect(analyticsCalls).toBeGreaterThan(initialAnalyticsCalls);
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

    const payerFilter = await screen.findByRole("combobox", { name: /filter by payer/i });
    await waitFor(() => expect(screen.getByRole("option", { name: "Paid by Manas Nilorout" })).toBeInTheDocument());
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
      expect(screen.getByText("Showing 1 of 1 expense")).toBeInTheDocument();

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
