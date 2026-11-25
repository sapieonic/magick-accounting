import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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

const asha = { _id: "u1", name: "Asha Rao", email: "asha@example.com" };
const ravi = { _id: "u2", name: "Ravi Iyer", email: "ravi@example.com" };

const trip: TripSummary = {
  _id: "trip-1",
  name: "Pune visit",
  destinations: ["Pune"],
  startDate: "2026-10-12T00:00:00.000Z",
  endDate: "2026-10-14T00:00:00.000Z",
  travelers: [asha, ravi],
  status: "completed",
};

function makeExpense(overrides: Partial<ExpenseListItem>): ExpenseListItem {
  return {
    _id: "e",
    title: "Expense",
    amount: 100,
    amountInBaseCurrency: 100,
    currency: { _id: "c", code: "INR", name: "Indian Rupee", symbol: "₹", isBase: true },
    date: "2026-10-13T00:00:00.000Z",
    description: "",
    paymentSource: "pocket",
    category: { _id: "cat", name: "Travel" },
    department: { _id: "dep", name: "Sales" },
    createdBy: asha,
    trip: { _id: "trip-1", name: "Pune visit" },
    travelType: "cab",
    ...overrides,
  };
}

const cab = makeExpense({ _id: "cab", title: "Airport cab", amount: 600, amountInBaseCurrency: 600 });
const dinner = makeExpense({
  _id: "dinner",
  title: "Client dinner",
  amount: 3000,
  amountInBaseCurrency: 3000,
  travelType: "food",
  createdBy: ravi,
  paymentSource: "multiple",
  pocketAmount: 1000,
  pocketAmountInBaseCurrency: 1000,
  payments: [
    { paidBy: asha, amount: 1000, amountInBaseCurrency: 1000, source: "pocket" },
    { paidBy: ravi, amount: 2000, amountInBaseCurrency: 2000, source: "company" },
  ],
});

describe("TripCluster", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes canModify through to its rows", () => {
    const canModify = vi.fn((expense: ExpenseListItem) => expense.createdBy?._id === asha._id);
    render(
      <TripCluster
        trip={trip}
        expenses={[cab, dinner]}
        expanded
        onToggle={vi.fn()}
        selectedId="dinner"
        onSelect={vi.fn()}
        inlineDetail
        onDelete={vi.fn()}
        onRemoveFromTrip={vi.fn()}
        canModify={canModify}
      />
    );

    expect(canModify).toHaveBeenCalledWith(expect.objectContaining({ _id: "dinner" }));
    expect(screen.getByRole("button", { name: "Delete Airport cab" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit Airport cab" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete Client dinner" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove Client dinner from trip" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Edit Client dinner" })).not.toBeInTheDocument();
    // The open (read-only) detail has no actions either.
    expect(screen.queryByRole("button", { name: /^Delete$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Edit$/ })).not.toBeInTheDocument();
  });

  it("keeps every row's actions when canModify is omitted", () => {
    render(
      <TripCluster
        trip={trip}
        expenses={[cab, dinner]}
        expanded
        onToggle={vi.fn()}
        selectedId={null}
        onSelect={vi.fn()}
        inlineDetail
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Delete Airport cab" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete Client dinner" })).toBeInTheDocument();
  });
});
