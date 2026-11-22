import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ExpenseDetail from "./ExpenseDetail";
import { api } from "@/lib/api";
import type { ExpenseListItem } from "@/types/expense";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(() => Promise.resolve({ downloadUrl: "https://example.com/receipt.png" })) },
}));

const expense: ExpenseListItem = {
  _id: "exp-1",
  title: "Team dinner",
  amount: 865.19,
  amountInBaseCurrency: 865.19,
  currency: { _id: "inr", code: "INR", name: "Indian Rupee", symbol: "₹", isBase: true },
  date: "2026-11-21T00:00:00.000Z",
  description: "",
  paymentSource: "company",
  category: { _id: "cat", name: "Meals & Entertainment" },
  department: { _id: "dep", name: "Meetings" },
  createdBy: { _id: "u1", name: "Manas Nilorout", email: "manas@example.com" },
  receiptKey: "receipts/u1/bill.png",
  receiptFilename: "bill.png",
};

describe("ExpenseDetail receipt preview", () => {
  it("shows a large preview above the fields in the side panel", async () => {
    render(<ExpenseDetail expense={expense} editHref="/edit" showHeader />);

    const preview = await screen.findByRole("img", { name: "Receipt for Team dinner" });
    expect(preview).toHaveClass("h-auto", "w-full");
    expect(preview).not.toHaveClass("object-contain");
    const receipt = screen.getByRole("region", { name: "Receipt" });
    const fields = screen.getByText("Submitted by");
    expect(receipt.compareDocumentPosition(fields) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith("/api/upload?key=receipts%2Fu1%2Fbill.png");
  });

  it("keeps the compact preview under the fields when the detail is inline", async () => {
    render(<ExpenseDetail expense={{ ...expense, receiptFilename: "bill.pdf", receiptKey: "receipts/u1/bill.pdf" }} editHref="/edit" />);

    const preview = await screen.findByTitle("Receipt for Team dinner");
    expect(preview).toHaveClass("h-[min(500px,60dvh)]", "w-full");
    expect(preview).not.toHaveClass("h-[min(48dvh,640px)]");
    const fields = screen.getByText("Submitted by");
    expect(fields.compareDocumentPosition(preview) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
