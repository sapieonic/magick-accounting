import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import DashboardPage from "./page";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
  })),
}));

// Mock AuthContext
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

// Mock ThemeContext
vi.mock("@/contexts/ThemeContext", () => ({
  useTheme: vi.fn(() => ({ theme: "light" })),
}));

// Mock API
vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
  },
}));

// Mock useTitle
vi.mock("@/hooks/useTitle", () => ({
  useTitle: vi.fn(),
}));

// Mock Recharts
vi.mock("recharts", () => {
  return {
    ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
    AreaChart: ({ children }: any) => <div data-testid="area-chart">{children}</div>,
    Area: () => <div data-testid="area" />,
    XAxis: () => <div data-testid="xaxis" />,
    YAxis: () => <div data-testid="yaxis" />,
    CartesianGrid: () => <div data-testid="grid" />,
    BarChart: ({ children, data }: any) => <div data-testid="bar-chart" data-chart-data={JSON.stringify(data)}>{children}</div>,
    Bar: () => <div data-testid="bar" />,
    PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
    Pie: ({ data }: any) => <div data-testid="pie" data-pie-data={JSON.stringify(data)}></div>,
    Cell: () => <div data-testid="cell" />,
    Tooltip: () => <div data-testid="tooltip" />,
  };
});

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render newly added charts (Payment Source & Department Spend) with data", async () => {
    vi.mocked(useRouter).mockReturnValue({ push: vi.fn() } as any);
    vi.mocked(useAuth).mockReturnValue({ user: { name: "Test User" }, isAdmin: true } as any);
    
    // Mock the stats API calls
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/api/dashboard/stats") {
        return Promise.resolve({
          totalExpenses: 5,
          totalAmount: 1000,
          departmentCount: 2,
          categoryCount: 3,
          recentExpenses: []
        });
      }
      if (url === "/api/dashboard/charts") {
        return Promise.resolve({
          monthlyTrend: [],
          topCategories: [],
          paymentSources: [
            { name: "company", total: 600, count: 2 },
            { name: "pocket", total: 400, count: 3 }
          ],
          departmentSpend: [
            { _id: "dep1", name: "Engineering", total: 1000, count: 5 }
          ]
        });
      }
      return Promise.resolve({});
    });

    render(<DashboardPage />);

    // Wait for the data to load and components to mount
    await waitFor(() => {
      expect(screen.getByText("Department Spend")).toBeInTheDocument();
    });

    expect(screen.getByText("Payment Source")).toBeInTheDocument();

    // Verify Bar Chart received department data
    const barChart = screen.getByTestId("bar-chart");
    const barData = JSON.parse(barChart.getAttribute("data-chart-data") || "[]");
    expect(barData).toHaveLength(1);
    expect(barData[0].name).toBe("Engineering");

    // Verify Pie Chart received payment source data
    // There are multiple pie charts (Top Categories and Payment Source), so we find the specific one by its data
    const pies = screen.getAllByTestId("pie");
    const paymentPie = pies.find(p => p.getAttribute("data-pie-data")?.includes("company"));
    expect(paymentPie).toBeDefined();
    
    const pieData = JSON.parse(paymentPie!.getAttribute("data-pie-data") || "[]");
    expect(pieData).toHaveLength(2);
    expect(pieData[0].name).toBe("company");
    expect(pieData[1].name).toBe("pocket");
  });
});
