import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AddAssetsToExpensePage from "./page";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "exp-1" }), useRouter: () => ({ push }) }));
vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("@/hooks/useTitle", () => ({ useTitle: vi.fn() }));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

const expense = {
  _id: "exp-1",
  title: "Laptop purchase",
  amount: 200000,
  gstAmount: 36000,
  date: "2026-08-16T00:00:00.000Z",
  currency: { _id: "inr", code: "INR", symbol: "₹" },
};

function mockExpense(assets: { allocatedAmount: number; allocatedGstAmount: number }[]) {
  vi.mocked(api.get).mockImplementation(async (url: string) =>
    url === "/api/users" ? { users: [] } : { expense, assets }
  );
}

describe("AddAssetsToExpensePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      user: { _id: "u1", name: "Asha", email: "asha@example.com" },
      isAdmin: false,
    } as never);
  });

  it("offers a first asset while some of the expense is unallocated, and says how many are linked", async () => {
    mockExpense([{ allocatedAmount: 50000, allocatedGstAmount: 9000 }]);
    render(<AddAssetsToExpensePage />);

    expect(await screen.findByRole("group", { name: "Asset 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create linked assets" })).toBeEnabled();
    expect(screen.getByText("1 asset already linked")).toBeInTheDocument();
    // The breadcrumb names the expense; the meta doesn't repeat it.
    expect(screen.getAllByText("Laptop purchase")).toHaveLength(1);
  });

  it("explains a fully allocated expense instead of offering an asset form", async () => {
    mockExpense([
      { allocatedAmount: 120000, allocatedGstAmount: 21600 },
      { allocatedAmount: 80000, allocatedGstAmount: 14400 },
    ]);
    render(<AddAssetsToExpensePage />);

    expect(await screen.findByText("Fully allocated")).toBeInTheDocument();
    expect(screen.getByText("2 assets already linked")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Asset 1" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create linked assets" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View assets" })).toHaveAttribute("href", "/dashboard/assets");
  });
});
