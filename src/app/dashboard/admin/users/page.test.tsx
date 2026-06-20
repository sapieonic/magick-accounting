import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import AdminUsersPage from "./page";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({
    replace: vi.fn(),
  })),
}));

// Mock API
vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}));

// Mock AuthContext
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

// Mock useTitle
vi.mock("@/hooks/useTitle", () => ({
  useTitle: vi.fn(),
}));

// Mock Toast
vi.mock("@/components/ui/Toast", () => ({
  useToast: vi.fn(() => ({
    toast: vi.fn(),
  })),
}));

// Mock Recharts to avoid ResizeObserver issues in JSDOM
vi.mock("recharts", () => {
  return {
    ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
    PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
    Pie: ({ data }: any) => <div data-testid="pie" data-pie-data={JSON.stringify(data)}></div>,
    Cell: () => <div data-testid="cell"></div>,
    Tooltip: () => <div data-testid="tooltip"></div>,
  };
});

describe("AdminUsersPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should redirect non-admins to dashboard", async () => {
    const replaceMock = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ replace: replaceMock } as any);
    vi.mocked(useAuth).mockReturnValue({ isAdmin: false, isMasterAdmin: false } as any);

    render(<AdminUsersPage />);

    expect(replaceMock).toHaveBeenCalledWith("/dashboard");
  });

  it("should render users list and pie chart when admin", async () => {
    vi.mocked(useRouter).mockReturnValue({ replace: vi.fn() } as any);
    vi.mocked(useAuth).mockReturnValue({ isAdmin: true, isMasterAdmin: true } as any);
    
    vi.mocked(api.get).mockResolvedValueOnce({
      users: [
        { _id: "1", name: "Alice", email: "alice@test.com", role: "admin", totalSpend: 500 },
        { _id: "2", name: "Bob", email: "bob@test.com", role: "user", totalSpend: 300 },
        { _id: "3", name: "Charlie", email: "charlie@test.com", role: "user", totalSpend: 0 },
      ],
    });

    render(<AdminUsersPage />);

    expect((await screen.findAllByText("Alice")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Bob").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Charlie").length).toBeGreaterThan(0);

    // Check if pie chart is rendered
    expect(screen.getByText("Spend by User")).toBeInTheDocument();
    expect(screen.getByTestId("pie-chart")).toBeInTheDocument();

    // Verify Pie data only includes users with spend > 0
    const pieEl = screen.getByTestId("pie");
    const pieData = JSON.parse(pieEl.getAttribute("data-pie-data") || "[]");
    
    expect(pieData).toHaveLength(2); // Alice and Bob
    expect(pieData[0].name).toBe("Alice");
    expect(pieData[0].value).toBe(500);
    expect(pieData[1].name).toBe("Bob");
    expect(pieData[1].value).toBe(300);
  });

  it("should display empty state when no users are returned", async () => {
    vi.mocked(useRouter).mockReturnValue({ replace: vi.fn() } as any);
    vi.mocked(useAuth).mockReturnValue({ isAdmin: true, isMasterAdmin: true } as any);
    vi.mocked(api.get).mockResolvedValueOnce({ users: [] });

    render(<AdminUsersPage />);

    expect(await screen.findByText("No users yet")).toBeInTheDocument();
    
    // Pie chart should NOT be in the document
    expect(screen.queryByText("Spend by User")).not.toBeInTheDocument();
  });
});
