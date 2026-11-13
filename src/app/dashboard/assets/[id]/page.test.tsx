import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import AssetDetailPage from "./page";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

vi.mock("next/navigation", () => ({ useParams: () => ({ id: "asset-1" }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("@/hooks/useTitle", () => ({ useTitle: vi.fn() }));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

const asset = {
  _id: "asset-1",
  assetTag: "AST-0001",
  name: "MacBook Pro",
  assetCategory: "Computer & Laptop",
  serialNumber: "",
  make: "",
  assetModel: "",
  purpose: "",
  location: "",
  putToUseDate: "2026-08-16T00:00:00.000Z",
  status: "in_use",
  department: { _id: "d1", name: "Engineering" },
  purchaseExpense: { _id: "exp-1", title: "Laptop purchase", date: "2026-08-16T00:00:00.000Z" },
};

/** The value cell of a purchase-record row. */
function detail(label: string) {
  const dt = screen.getByText(label, { selector: "dt" });
  return within(dt.parentElement!.querySelector("dd")!);
}

describe("AssetDetailPage purchase record", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ isAdmin: false } as never);
  });

  it("calls the receipt restricted when the viewer can't see the purchase financials", async () => {
    // The API drops receiptKey along with the amounts for these viewers.
    vi.mocked(api.get).mockResolvedValue({ asset: { ...asset, canViewFinancials: false }, assignments: [], events: [] });
    render(<AssetDetailPage />);

    await screen.findByRole("heading", { name: "MacBook Pro", level: 1 });
    expect(detail("Receipt").getByText("Restricted")).toBeInTheDocument();
    expect(screen.queryByText("No receipt")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /View expense/ })).not.toBeInTheDocument();
  });

  it("says there is no receipt only when the viewer could have seen one", async () => {
    vi.mocked(api.get).mockResolvedValue({
      asset: { ...asset, canViewFinancials: true, allocatedAmount: 1000, allocatedGstAmount: 180 },
      assignments: [],
      events: [],
    });
    render(<AssetDetailPage />);

    await screen.findByRole("heading", { name: "MacBook Pro", level: 1 });
    expect(detail("Receipt").getByText("No receipt")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View expense/ })).toHaveAttribute("href", "/dashboard/expenses/exp-1/edit");
  });
});
