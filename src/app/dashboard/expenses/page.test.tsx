import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ExpensesPage from "./page";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";

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

describe("ExpensesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
        return Promise.resolve({
          expenses: [expense],
          pagination: { page: 1, limit: 25, total: 1, pages: 1 },
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

    expect(listRegion).toHaveClass("lg:overflow-y-auto");
    expect(listRegion).toHaveClass("lg:min-h-0");
    expect(analyticsRegion).toHaveClass("lg:overflow-y-auto");
    expect(analyticsRegion).toHaveClass("lg:min-h-0");
    expect(screen.getByText("Monthly Trend")).toBeInTheDocument();
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
});
