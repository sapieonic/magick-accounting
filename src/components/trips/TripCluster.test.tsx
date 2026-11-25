import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
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

const goaTrip: TripSummary = {
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

function makeGoaExpense(overrides: Partial<ExpenseListItem>): ExpenseListItem {
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

function renderGoaCluster(expenses: ExpenseListItem[]) {
  return render(
    <TripCluster
      trip={goaTrip}
      expenses={expenses}
      expanded={false}
      onToggle={vi.fn()}
      selectedId={null}
      onSelect={vi.fn()}
      inlineDetail
    />
  );
}

describe("TripCluster approval totals", () => {
  it("totals approved expenses and shows what's awaiting approval beside the total", () => {
    renderGoaCluster([
      makeGoaExpense({ _id: "hotel", amount: 8000, amountInBaseCurrency: 8000 }),
      // Legacy: no status, so approved.
      makeGoaExpense({ _id: "flight", amount: 12000, amountInBaseCurrency: 12000, approvalStatus: undefined }),
      makeGoaExpense({ _id: "cab", amount: 650, amountInBaseCurrency: 650, approvalStatus: "pending" }),
      makeGoaExpense({ _id: "bar", amount: 900, amountInBaseCurrency: 900, approvalStatus: "rejected" }),
    ]);

    expect(screen.getByText("₹20,000.00")).toBeInTheDocument();
    expect(screen.getByText("+₹650.00 awaiting approval")).toBeInTheDocument();
    // The count still lists every expense in the cluster.
    expect(screen.getByText("4 expenses")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Goa client visit/ })).toHaveAccessibleName(
      /4 expenses, ₹20,000\.00, plus ₹650\.00 awaiting approval$/
    );
  });

  it("shows only the total when everything is approved", () => {
    renderGoaCluster([makeGoaExpense({ _id: "hotel", amount: 8000, amountInBaseCurrency: 8000, approvalStatus: "approved" })]);

    expect(screen.getByText("₹8,000.00")).toBeInTheDocument();
    expect(screen.queryByText(/awaiting approval|pending/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Goa client visit/ })).toHaveAccessibleName(/₹8,000\.00$/);
  });

  it("forwards the approval actions to an expense opened inside the trip", () => {
    const onApprove = vi.fn();
    const pending = makeGoaExpense({ _id: "cab", amount: 800, amountInBaseCurrency: 800, approvalStatus: "pending", receiptKey: undefined });
    render(
      <TripCluster
        trip={goaTrip}
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

  it("passes both canModify and the approval actions to its rows", () => {
    // Asha (a user) is signed in: her own pending cab, and Ravi's pending dinner she paid part of.
    const ownCab = { ...cab, approvalStatus: "pending" as const };
    const sharedDinner = { ...dinner, approvalStatus: "pending" as const };
    const review = { onResubmit: vi.fn(), viewerId: asha._id, viewerRole: "user" as const };
    render(
      <TripCluster
        trip={trip}
        expenses={[ownCab, sharedDinner]}
        expanded
        onToggle={vi.fn()}
        selectedId="dinner"
        onSelect={vi.fn()}
        inlineDetail
        onDelete={vi.fn()}
        review={review}
        canModify={(expense) => expense.createdBy?._id === asha._id}
      />
    );

    expect(screen.getByRole("button", { name: "Delete Airport cab" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete Client dinner" })).not.toBeInTheDocument();
    // The open shared dinner: its status, without any action.
    const detail = document.getElementById("expense-detail-dinner")!;
    expect(within(detail).getByText("Awaiting approval")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Delete$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Edit$/ })).not.toBeInTheDocument();
  });
});
