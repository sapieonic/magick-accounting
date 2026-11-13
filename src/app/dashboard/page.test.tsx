import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import DashboardPage from "./page";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { formatBaseCurrency } from "@/lib/currency";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
  },
}));

vi.mock("@/hooks/useTitle", () => ({
  useTitle: vi.fn(),
}));

const monthlyTrend = [
  { month: "Jun", key: "2026-06", total: 100, count: 1 },
  { month: "Jul", key: "2026-07", total: 0, count: 0 },
  { month: "Aug", key: "2026-08", total: 200, count: 2 },
  { month: "Sep", key: "2026-09", total: 0, count: 0 },
  { month: "Oct", key: "2026-10", total: 500, count: 1 },
  { month: "Nov", key: "2026-11", total: 300, count: 1 },
];

function mockApi(stats: Record<string, unknown>, charts: Record<string, unknown>) {
  vi.mocked(api.get).mockImplementation((url: string) => {
    if (url === "/api/dashboard/stats") return Promise.resolve(stats);
    if (url === "/api/dashboard/charts") return Promise.resolve(charts);
    return Promise.resolve({});
  });
}

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ user: { name: "Test User" }, isAdmin: true } as any);
  });

  it("renders totals, monthly bars, ranked categories/departments, who paid and latest entries", async () => {
    mockApi(
      {
        totalExpenses: 5,
        totalAmount: 1000,
        departmentCount: 2,
        categoryCount: 3,
        recentExpenses: [
          {
            _id: "exp1",
            title: "Figma seat",
            amount: 12,
            amountInBaseCurrency: 1000,
            currency: { code: "USD", symbol: "$", isBase: false },
            date: "2026-11-10T00:00:00.000Z",
            category: { name: "Software" },
            department: { name: "Engineering" },
          },
        ],
      },
      {
        monthlyTrend,
        topCategories: [{ _id: "cat1", name: "Software", total: 800, count: 4 }],
        paymentSources: [
          { name: "company", total: 600, count: 2 },
          { name: "pocket", total: 400, count: 3 },
        ],
        departmentSpend: [{ _id: "dep1", name: "Engineering", total: 1000, count: 5 }],
      }
    );

    render(<DashboardPage />);

    expect(await screen.findByRole("heading", { level: 1, name: "Overview" })).toBeInTheDocument();
    expect(screen.getByText("Company spend across every department, all time, in INR.")).toBeInTheDocument();

    // Totals band
    const totals = screen.getByRole("region", { name: "Totals" });
    expect(within(totals).getByText(formatBaseCurrency(1000))).toBeInTheDocument();
    expect(within(totals).getByText("5 expenses · 2 departments · 3 categories")).toBeInTheDocument();
    expect(within(totals).getByText("November to date")).toBeInTheDocument();
    expect(within(totals).getByText("40.0% of spend")).toBeInTheDocument();
    expect(within(totals).getByText(formatBaseCurrency(200))).toBeInTheDocument(); // average

    // Monthly bars open that month's expenses
    const months = screen.getByRole("list", { name: "Monthly spend" });
    expect(within(months).getAllByRole("link")).toHaveLength(6);
    expect(within(months).getByRole("link", { name: /^October 2026: / })).toHaveAttribute(
      "href",
      "/dashboard/expenses?month=2026-10"
    );
    expect(within(months).getByRole("link", { name: /^November 2026 to date: / })).toBeInTheDocument();
    expect(screen.getByText(/November is hatched: month to date\./)).toBeInTheDocument();

    // Categories: top rows link to the filtered list, the remainder is grouped
    const categories = screen.getByRole("region", { name: "Categories" });
    expect(within(categories).getByRole("link", { name: /Software/ })).toHaveAttribute(
      "href",
      "/dashboard/expenses?category=cat1"
    );
    expect(within(categories).getByText("Other categories")).toBeInTheDocument();
    expect(within(categories).getByText(formatBaseCurrency(200))).toBeInTheDocument();

    // Departments
    const departments = screen.getByRole("region", { name: "Departments" });
    expect(within(departments).getByRole("link", { name: /Engineering/ })).toHaveAttribute(
      "href",
      "/dashboard/expenses?department=dep1"
    );

    // Who paid
    const whoPaid = screen.getByRole("region", { name: "Who paid" });
    expect(within(whoPaid).getByRole("img", { name: "Company paid 60.0%, pocket 40.0%" })).toBeInTheDocument();

    // Latest entries: original amount first, base equivalent below
    const latest = screen.getByRole("region", { name: "Your latest entries" });
    const row = within(latest).getByRole("link", { name: /Figma seat/ });
    expect(row).toHaveAttribute("href", "/dashboard/expenses?expand=exp1");
    expect(within(row).getByText(formatBaseCurrency(1000))).toBeInTheDocument();
  });

  it("shows empty states when there is no data", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { name: "Test User" }, isAdmin: false } as any);
    mockApi(
      { totalExpenses: 0, totalAmount: 0, departmentCount: 0, categoryCount: 0, recentExpenses: [] },
      { monthlyTrend: [], topCategories: [], paymentSources: [], departmentSpend: [] }
    );

    render(<DashboardPage />);

    expect(await screen.findByText("Your spend across all time, in INR.")).toBeInTheDocument();
    expect(screen.getByText("No trend data yet")).toBeInTheDocument();
    expect(screen.getByText("No category data")).toBeInTheDocument();
    expect(screen.getByText("No department data")).toBeInTheDocument();
    expect(screen.getByText("No payment data")).toBeInTheDocument();
    expect(screen.getByText("No expenses yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add expense" })).toHaveAttribute("href", "/dashboard/expenses/new");
  });

  it("still renders when the API fails", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("network"));

    render(<DashboardPage />);

    expect(await screen.findByRole("heading", { level: 1, name: "Overview" })).toBeInTheDocument();
    expect(screen.getByText("No expenses yet")).toBeInTheDocument();
  });
});
