import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import ExpenseRow from "./ExpenseRow";
import { api } from "@/lib/api";
import type { ExpenseListItem } from "@/types/expense";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/ui/Toast", () => ({
  useToast: vi.fn(() => ({ toast: vi.fn() })),
}));

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn() },
}));

const USD = { _id: "usd", code: "USD", name: "US Dollar", symbol: "$", isBase: false };

function makeExpense(overrides: Partial<ExpenseListItem> = {}): ExpenseListItem {
  return {
    _id: "exp-1",
    title: "Team dinner",
    amount: 100,
    amountInBaseCurrency: 8350,
    currency: USD,
    date: "2026-10-13T00:00:00.000Z",
    description: "",
    paymentSource: "company",
    category: { _id: "cat", name: "Meals & Entertainment" },
    department: { _id: "dep", name: "Sales" },
    createdBy: { _id: "u1", name: "Asha Rao", email: "asha@example.com" },
    trip: { _id: "trip-1", name: "Pune visit" },
    travelType: "food",
    ...overrides,
  };
}

function renderRow(props: Partial<React.ComponentProps<typeof ExpenseRow>> = {}) {
  const onSelect = vi.fn();
  const utils = render(
    <ExpenseRow expense={makeExpense()} selected={false} onSelect={onSelect} editHref="/edit" {...props} />
  );
  return { onSelect, ...utils };
}

describe("ExpenseRow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockResolvedValue({ downloadUrl: "https://example.com/r.pdf" });
  });

  it("shows the bill amount with its INR equivalent and opens on click", () => {
    const { onSelect } = renderRow();
    expect(screen.getByText("$100.00")).toBeInTheDocument();
    expect(screen.getByText("₹8,350.00")).toBeInTheDocument();

    const title = screen.getByRole("button", { name: "Team dinner" });
    expect(title).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(title);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("marks receipts and linked assets, and links the trip in flat lists", () => {
    renderRow({
      expense: makeExpense({ receiptKey: "r/1.pdf", receiptFilename: "1.pdf", linkedAssetCount: 2 }),
      showTripLink: true,
    });
    expect(screen.getByRole("img", { name: "Receipt attached" })).toBeInTheDocument();
    expect(screen.getByTitle("2 linked assets")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Pune visit/ })).toHaveAttribute("href", "/dashboard/trips/trip-1");
  });

  it("only offers the quick actions its caller handles", () => {
    const onDelete = vi.fn();
    renderRow({ onDelete });
    expect(screen.getByRole("link", { name: "Edit Team dinner" })).toHaveAttribute("href", "/edit");
    expect(screen.queryByRole("button", { name: /Remove Team dinner/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete Team dinner" }));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ _id: "exp-1" }));
  });

  it("opens the detail under the row with every payer of a shared bill", () => {
    renderRow({
      selected: true,
      expense: makeExpense({
        paymentSource: "multiple",
        payments: [
          { paidBy: { name: "Asha Rao" }, amount: 60, source: "pocket" },
          { paidBy: { name: "Ravi Iyer" }, amount: 40, source: "company" },
        ],
        linkedAssetCount: 1,
        gstAmount: 5,
      }),
    });

    const detail = document.getElementById("expense-detail-exp-1")!;
    expect(screen.getByRole("button", { name: "Team dinner" })).toHaveAttribute("aria-controls", "expense-detail-exp-1");
    expect(within(detail).getByText("Ravi Iyer")).toBeInTheDocument();
    expect(within(detail).getByText("$60.00")).toBeInTheDocument();
    expect(within(detail).getByText("= ₹8,350.00 at ₹83.50 per USD, fixed on entry")).toBeInTheDocument();
    expect(within(detail).getByText("$5.00")).toBeInTheDocument();
    expect(within(detail).getByRole("link", { name: "1 linked asset" })).toHaveAttribute("href", "/dashboard/assets");
    expect(within(detail).getByRole("link", { name: /Pune visit/ })).toHaveAttribute("href", "/dashboard/trips/trip-1");
    expect(within(detail).getByRole("link", { name: "Edit" })).toHaveAttribute("href", "/edit");
  });

  it("names the category in the narrow sub-line, where the glyph stands in for the column", () => {
    renderRow();
    // The narrow layout's sub-line (the wide one shows payer · source instead).
    expect(screen.getByText("Meals & Entertainment · 13 Oct · Asha Rao")).toBeInTheDocument();
  });

  it("keeps the hover toolbar out of reach until it shows, and off hover-less screens", () => {
    renderRow({ onDelete: vi.fn() });
    const toolbar = screen.getByTestId("row-actions");
    // Invisible (opacity-0) controls mustn't take taps on touch screens.
    expect(toolbar).toHaveClass("pointer-events-none", "group-hover:pointer-events-auto", "focus-within:pointer-events-auto");
    expect(toolbar).toHaveClass("hidden", "sm:[@media(hover:hover)]:flex");
    expect(toolbar).not.toHaveClass("sm:flex");
  });

  it("stacks the hover toolbar over the amount, which hides meanwhile, in a cell sized to the wider", () => {
    renderRow({ onDelete: vi.fn(), onRemoveFromTrip: vi.fn() });
    const toolbar = screen.getByTestId("row-actions");
    const amount = screen.getByText("$100.00").parentElement!;
    // One grid area of one cell: the cell grows to fit the toolbar, so it never
    // reaches over the category or title columns.
    expect(toolbar.parentElement).toBe(amount.parentElement);
    expect(toolbar.parentElement).toHaveClass("grid", "justify-items-end");
    expect(toolbar).toHaveClass("[grid-area:1/1]");
    expect(amount).toHaveClass("[grid-area:1/1]");
    expect(toolbar).not.toHaveClass("absolute");
    expect(amount).toHaveClass("sm:[@media(hover:hover)]:group-hover:invisible");
  });

  it("names an untagged trip expense by its category, not 'Untagged'", () => {
    renderRow({ variant: "trip", expense: makeExpense({ travelType: null }) });
    expect(screen.getByText("Meals & Entertainment · 13 Oct · Asha Rao")).toBeInTheDocument();
    expect(screen.queryByText(/Untagged/)).not.toBeInTheDocument();
  });

  it("labels a tagged trip expense by its travel type", () => {
    renderRow({ variant: "trip" });
    expect(screen.getByText("Food & drinks · 13 Oct · Asha Rao")).toBeInTheDocument();
  });

  it("gives the trip link under the title a 24px target", () => {
    renderRow({ showTripLink: true });
    expect(screen.getByRole("link", { name: /Pune visit/ })).toHaveClass("inline-flex", "min-h-6", "items-center");
  });

  it("leaves the detail to the caller when not inline", () => {
    renderRow({ selected: true, inlineDetail: false, detailId: "side-panel" });
    expect(screen.getByRole("button", { name: "Team dinner" })).toHaveAttribute("aria-controls", "side-panel");
    expect(screen.queryByRole("link", { name: "Edit" })).not.toBeInTheDocument();
  });
});
