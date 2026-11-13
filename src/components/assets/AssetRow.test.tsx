import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import AssetRow, { type AssetListItem } from "./AssetRow";

const base: AssetListItem = {
  _id: "asset-1",
  assetTag: "AST-0001",
  name: "MacBook Pro",
  assetCategory: "Computer & Laptop",
  serialNumber: "SN123",
  make: "Apple",
  assetModel: "M3",
  status: "under_repair",
  capitalizedCost: 200000,
  bookValue: 150000,
  canViewFinancials: true,
  assignedTo: { _id: "u1", name: "Asha", email: "asha@example.com" },
  department: { _id: "d1", name: "Engineering" },
  purchaseExpense: {
    _id: "exp-1",
    title: "Laptop purchase",
    date: "2026-08-16T00:00:00.000Z",
    receiptKey: "receipts/u1/r.pdf",
    currency: { code: "INR", symbol: "₹" },
  },
};

function renderRow(asset: AssetListItem, onOpenReceipt = vi.fn(), openingReceipt = false) {
  render(
    <ul>
      <AssetRow asset={asset} openingReceipt={openingReceipt} onOpenReceipt={onOpenReceipt} />
    </ul>
  );
  return onOpenReceipt;
}

describe("AssetRow", () => {
  it("links to the asset and its purchase expense and shows the book value", () => {
    renderRow(base);
    expect(screen.getByRole("link", { name: "MacBook Pro" })).toHaveAttribute("href", "/dashboard/assets/asset-1");
    expect(screen.getByRole("link", { name: "Laptop purchase" })).toHaveAttribute(
      "href",
      "/dashboard/expenses/exp-1/edit"
    );
    expect(screen.getByText(/1,50,000/)).toBeInTheDocument();
    expect(screen.getAllByText("Under repair").length).toBeGreaterThan(0);
  });

  it("moves cost and status under the name when narrow, leaving the value column to the book value", () => {
    renderRow(base);
    const titleBlock = screen.getByRole("link", { name: "MacBook Pro" }).parentElement!;
    const narrowLine = within(titleBlock).getByText("Under repair").closest("span.flex")!;
    expect(narrowLine).toHaveClass("[@container(min-width:760px)]:hidden");
    expect(within(narrowLine as HTMLElement).getByText(/Cost ₹2,00,000\.00/)).toBeInTheDocument();

    const bookValue = screen.getByText("₹1,50,000.00");
    const valueColumn = bookValue.parentElement!;
    // There, the cost only shows once the columns do, and the status has its own column.
    expect(within(valueColumn).getByText(/Cost/)).toHaveClass("hidden", "[@container(min-width:760px)]:block");
    expect(within(valueColumn).queryByText("Under repair")).not.toBeInTheDocument();
  });

  it("dates the purchase by its calendar day, in the app's day-month format", () => {
    const tz = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    try {
      renderRow(base);
      expect(screen.getAllByText("16 Aug 2026").length).toBeGreaterThan(0);
    } finally {
      process.env.TZ = tz;
    }
  });

  it("hides financials and the expense link when the viewer cannot see them", () => {
    renderRow({ ...base, canViewFinancials: false, bookValue: undefined, capitalizedCost: undefined });
    expect(screen.getByText("Restricted")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Laptop purchase" })).not.toBeInTheDocument();
  });

  it("opens the receipt from its button", async () => {
    const onOpen = renderRow(base);
    await userEvent.click(screen.getByRole("button", { name: "Open receipt for MacBook Pro" }));
    expect(onOpen).toHaveBeenCalledWith(base);
  });

  it("says when there is no receipt", () => {
    renderRow({ ...base, purchaseExpense: { ...base.purchaseExpense, receiptKey: undefined } });
    expect(screen.getByText("No receipt")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
