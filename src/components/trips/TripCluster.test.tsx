import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import TripCluster from "./TripCluster";
import type { ExpenseListItem } from "@/types/expense";
import type { TripSummary } from "@/types/trip";

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

const trip: TripSummary = {
  _id: "trip-1",
  name: "Goa client visit",
  destinations: ["Goa"],
  startDate: "2026-10-12T00:00:00.000Z",
  endDate: "2026-10-15T00:00:00.000Z",
  travelers: [{ _id: "u1", name: "Asha Rao", email: "asha@example.com" }],
  status: "completed",
};

function makeExpense(overrides: Partial<ExpenseListItem>): ExpenseListItem {
  return {
    _id: "e",
    title: "Expense",
    amount: 100,
    amountInBaseCurrency: 100,
    currency: { _id: "c", code: "INR", name: "Indian Rupee", symbol: "₹", isBase: true },
    date: "2026-10-12T00:00:00.000Z",
    description: "",
    paymentSource: "company",
    receiptKey: "r/receipt.png",
    category: { _id: "cat", name: "Travel" },
    department: { _id: "dep", name: "Sales" },
    createdBy: { _id: "u1", name: "Asha Rao", email: "asha@example.com" },
    trip: { _id: "trip-1", name: "Goa client visit" },
    travelType: null,
    ...overrides,
  };
}

function renderCluster(expenses: ExpenseListItem[]) {
  return render(
    <TripCluster
      trip={trip}
      expenses={expenses}
      expanded={false}
      onToggle={vi.fn()}
      selectedId={null}
      onSelect={vi.fn()}
      inlineDetail
    />
  );
}

describe("TripCluster", () => {
  it("totals approved expenses and shows what's awaiting approval beside the total", () => {
    renderCluster([
      makeExpense({ _id: "hotel", amount: 8000, amountInBaseCurrency: 8000 }),
      // Legacy: no status, so approved.
      makeExpense({ _id: "flight", amount: 12000, amountInBaseCurrency: 12000, approvalStatus: undefined }),
      makeExpense({ _id: "cab", amount: 650, amountInBaseCurrency: 650, approvalStatus: "pending" }),
      makeExpense({ _id: "bar", amount: 900, amountInBaseCurrency: 900, approvalStatus: "rejected" }),
    ]);

    expect(screen.getByText("₹20,000.00")).toBeInTheDocument();
    expect(screen.getByText("+₹650.00 pending")).toBeInTheDocument();
    // The count still lists every expense in the cluster.
    expect(screen.getByText("4 expenses")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Goa client visit/ })).toHaveAccessibleName(
      /4 expenses, ₹20,000\.00, plus ₹650\.00 awaiting approval$/
    );
  });

  it("shows only the total when everything is approved", () => {
    renderCluster([makeExpense({ _id: "hotel", amount: 8000, amountInBaseCurrency: 8000, approvalStatus: "approved" })]);

    expect(screen.getByText("₹8,000.00")).toBeInTheDocument();
    expect(screen.queryByText(/pending/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Goa client visit/ })).toHaveAccessibleName(/₹8,000\.00$/);
  });

  it("forwards the approval actions to an expense opened inside the trip", () => {
    const onApprove = vi.fn();
    const pending = makeExpense({ _id: "cab", amount: 800, amountInBaseCurrency: 800, approvalStatus: "pending", receiptKey: undefined });
    render(
      <TripCluster
        trip={trip}
        expenses={[pending]}
        expanded
        onToggle={vi.fn()}
        selectedId="cab"
        onSelect={vi.fn()}
        inlineDetail
        review={{ onApprove, onReject: vi.fn() }}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(onApprove).toHaveBeenCalledWith(pending);
  });
});
