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
    // The narrow layout's sub-line (the wide one shows the payer; the source is the icon).
    expect(screen.getByText("Meals & Entertainment · 13 Oct · Asha Rao")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Company account" })).toBeInTheDocument();
    expect(screen.queryByText("Company account")).not.toBeInTheDocument();
  });

  it("marks pocket, company and split bills with an icon instead of the source words", () => {
    const { rerender } = renderRow({ expense: makeExpense({ paymentSource: "pocket" }) });
    expect(screen.getByRole("img", { name: "Pocket" })).toHaveClass("ring-pocket");

    rerender(
      <ExpenseRow
        expense={makeExpense({ paymentSource: "split", pocketAmount: 40, pocketAmountInBaseCurrency: 40 })}
        selected={false}
        onSelect={vi.fn()}
        editHref="/edit"
      />
    );
    expect(screen.getByRole("img", { name: "Split" })).toBeInTheDocument();

    rerender(
      <ExpenseRow
        expense={makeExpense({
          paymentSource: "multiple",
          payments: [
            { paidBy: { name: "Asha Rao" }, amount: 60, source: "pocket" },
            { paidBy: { name: "Ravi Iyer" }, amount: 40, source: "company" },
          ],
        })}
        selected={false}
        onSelect={vi.fn()}
        editHref="/edit"
      />
    );
    expect(screen.getByRole("img", { name: "Company and pocket" })).toBeInTheDocument();
  });

  it("reads a several-people bill as pocket or company when every payer used the same source", () => {
    const { rerender } = renderRow({
      expense: makeExpense({
        paymentSource: "multiple",
        payments: [
          { paidBy: { name: "Asha Rao" }, amount: 60, source: "pocket" },
          { paidBy: { name: "Ravi Iyer" }, amount: 40, source: "pocket" },
        ],
      }),
    });
    expect(screen.getByRole("img", { name: "Pocket" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Company and pocket" })).not.toBeInTheDocument();

    rerender(
      <ExpenseRow
        expense={makeExpense({
          paymentSource: "multiple",
          payments: [
            { paidBy: { name: "Asha Rao" }, amount: 60, source: "company" },
            { paidBy: { name: "Ravi Iyer" }, amount: 40, source: "company" },
          ],
        })}
        selected={false}
        onSelect={vi.fn()}
        editHref="/edit"
      />
    );
    expect(screen.getByRole("img", { name: "Company account" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Company and pocket" })).not.toBeInTheDocument();
  });

  it("keeps the payment chip above the row click target, and a click on it still opens the row", () => {
    const { onSelect } = renderRow();
    const chip = screen.getByRole("img", { name: "Company account" });
    // The selected row uses the same soft accent fill, so the ring is what keeps the chip a chip.
    expect(chip).toHaveAttribute("title", "Company account");
    expect(chip).toHaveClass("ring-inset", "ring-accent-line");
    expect(chip.parentElement).toHaveClass("relative", "z-10");
    fireEvent.click(chip);
    expect(onSelect).toHaveBeenCalledTimes(1);
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

  describe("approval", () => {
    it("badges a pending row and keeps its amount out of the totals for screen readers too", () => {
      renderRow({ expense: makeExpense({ approvalStatus: "pending" }) });
      expect(screen.getByText("Awaiting approval")).toBeInTheDocument();
      const amount = screen.getByText("$100.00", { exact: false });
      expect(amount).toHaveClass("text-ink-3");
      expect(amount).not.toHaveClass("line-through");
      expect(amount).toHaveTextContent("$100.00 (awaiting approval, not in totals)");
    });

    it("strikes through a rejected amount and says why", () => {
      renderRow({ expense: makeExpense({ approvalStatus: "rejected" }) });
      expect(screen.getByText("Rejected")).toBeInTheDocument();
      const amount = screen.getByText("$100.00", { exact: false });
      expect(amount).toHaveClass("text-ink-3", "line-through");
      expect(amount).toHaveTextContent("(rejected, not in totals)");
    });

    it("leaves approved and legacy rows unbadged", () => {
      renderRow({ expense: makeExpense({ approvalStatus: "approved" }) });
      expect(screen.queryByText("Approved")).not.toBeInTheDocument();
      expect(screen.getByText("$100.00")).toHaveClass("text-ink");
    });

    it("review rows: a labelled checkbox that toggles without opening the row", () => {
      const onToggle = vi.fn();
      const { onSelect } = renderRow({
        variant: "review",
        expense: makeExpense({ approvalStatus: "pending", createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString() }),
        selection: { checked: false, onToggle, label: "Select Team dinner, $100.00", keyShortcut: "X" },
      });
      const box = screen.getByRole("checkbox", { name: "Select Team dinner, $100.00" });
      expect(box).toHaveAttribute("aria-keyshortcuts", "X");
      // Above the row's click target.
      expect(box.closest("label")).toHaveClass("relative", "z-10", "min-h-11", "min-w-11");
      fireEvent.click(box);
      expect(onToggle).toHaveBeenCalledTimes(1);
      expect(onSelect).not.toHaveBeenCalled();
      // The queue is all pending: no badge on each row, but when it was sent.
      expect(screen.queryByText("Awaiting approval")).not.toBeInTheDocument();
      expect(screen.getByText("Asha Rao · submitted 2 days ago")).toBeInTheDocument();
    });

    it("review rows without a selection have no checkbox column", () => {
      renderRow({ variant: "review", expense: makeExpense({ approvalStatus: "pending" }) });
      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    });
  });
});

describe("LedgerHead", () => {
  it("keeps the column heads decorative, and offers a labelled select-all when given one", async () => {
    const { LedgerHead, SelectAllCheckbox } = await import("./ExpenseRow");
    const onToggle = vi.fn();
    const { container, rerender } = render(<LedgerHead />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");

    rerender(<LedgerHead select={<SelectAllCheckbox selected={1} total={3} onToggle={onToggle} />} />);
    const all = screen.getByRole("checkbox", { name: "Select all 3" });
    expect((all as HTMLInputElement).indeterminate).toBe(true);
    fireEvent.click(all);
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(<LedgerHead select={<SelectAllCheckbox selected={3} total={3} onToggle={onToggle} />} />);
    expect(screen.getByRole("checkbox", { name: "Deselect all" })).toBeChecked();
  });
});
