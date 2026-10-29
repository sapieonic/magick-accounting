import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AddExistingExpensesModal from "./AddExistingExpensesModal";
import { api } from "@/lib/api";
import type { ExpenseListItem } from "@/types/expense";

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}));

const TRIP_ID = "f".repeat(24);
const INR = { _id: "inr", code: "INR", name: "Indian Rupee", symbol: "₹", isBase: true };
const USD = { _id: "usd", code: "USD", name: "US Dollar", symbol: "$", isBase: false };

function makeExpense(overrides: Partial<ExpenseListItem>): ExpenseListItem {
  return {
    _id: "e".repeat(24),
    title: "Expense",
    amount: 100,
    amountInBaseCurrency: 100,
    currency: INR,
    date: "2026-10-28T00:00:00.000Z",
    description: "",
    paymentSource: "pocket",
    category: { _id: "c1", name: "Travel" },
    department: { _id: "d1", name: "Sales" },
    createdBy: { _id: "u1", name: "Manas", email: "manas@example.com" },
    trip: null,
    travelType: null,
    ...overrides,
  };
}

const cab = makeExpense({ _id: "7".repeat(24), title: "Airport cab", amount: 600, amountInBaseCurrency: 600 });
const lunch = makeExpense({ _id: "8".repeat(24), title: "Team lunch", amount: 1400, amountInBaseCurrency: 1400 });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const candidateCalls = () =>
  vi.mocked(api.get).mock.calls.filter(([url]) => String(url).startsWith(`/api/trips/${TRIP_ID}/candidates`));

function renderModal(isOpen: boolean) {
  const props = { tripId: TRIP_ID, onClose: vi.fn(), onAdded: vi.fn() };
  const view = render(<AddExistingExpensesModal {...props} isOpen={isOpen} />);
  return {
    ...view,
    props,
    setOpen: (open: boolean) => view.rerender(<AddExistingExpensesModal {...props} isOpen={open} />),
  };
}

describe("AddExistingExpensesModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockResolvedValue({ expenses: [cab, lunch], truncated: false });
    vi.mocked(api.patch).mockResolvedValue({ added: 1 });
  });

  it("lists candidates and adds the selected ones", async () => {
    const user = userEvent.setup();
    const { props } = renderModal(true);

    const dialog = screen.getByRole("dialog", { name: "Add existing expenses" });
    await within(dialog).findByText("Airport cab");
    expect(candidateCalls()).toHaveLength(1);
    expect(within(dialog).getByRole("button", { name: /^Select all \(2\)/ })).toBeInTheDocument();
    expect(within(dialog).queryByText(/most recent/)).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("checkbox", { name: "Airport cab" }));
    await user.click(within(dialog).getByRole("button", { name: "Add 1 to trip" }));

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(`/api/trips/${TRIP_ID}/expenses`, { add: [cab._id] }));
    expect(props.onAdded).toHaveBeenCalledWith(1);
  });

  it("shows the base amount only for foreign-currency expenses", async () => {
    vi.mocked(api.get).mockResolvedValue({
      expenses: [
        makeExpense({ _id: "1".repeat(24), title: "Hotel NYC", amount: 200, amountInBaseCurrency: 16800, currency: USD }),
        makeExpense({ _id: "2".repeat(24), title: "Local cab", amount: 450, amountInBaseCurrency: 450 }),
      ],
    });
    renderModal(true);

    const hotelRow = (await screen.findByText("Hotel NYC")).closest("label")!;
    expect(hotelRow).toHaveTextContent("₹16,800.00");
    const cabRow = screen.getByText("Local cab").closest("label")!;
    expect(within(cabRow).getAllByText(/₹/)).toHaveLength(1);
  });

  it("notes when only the most recent matches are shown", async () => {
    vi.mocked(api.get).mockResolvedValue({ expenses: [cab, lunch], truncated: true });
    renderModal(true);

    const dialog = screen.getByRole("dialog", { name: "Add existing expenses" });
    await within(dialog).findByText("Airport cab");
    expect(within(dialog).getByText(/Showing the 2 most recent — search to narrow it down/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /^Select all shown \(2\)/ })).toBeInTheDocument();
  });

  it("starts clean on reopen: no stale list and a single request", async () => {
    const user = userEvent.setup();
    const { setOpen } = renderModal(true);
    await screen.findByText("Airport cab");

    await user.type(screen.getByLabelText("Search expenses"), "lunch");
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(`/api/trips/${TRIP_ID}/candidates?search=lunch`));
    await waitFor(() => expect(screen.queryByRole("status", { name: "Loading expenses" })).not.toBeInTheDocument());

    setOpen(false);
    vi.mocked(api.get).mockClear();
    const reopened = deferred<{ expenses: ExpenseListItem[] }>();
    vi.mocked(api.get).mockReturnValue(reopened.promise);
    setOpen(true);

    // The previous candidates are gone while the refetch is in flight.
    expect(screen.getByRole("status", { name: "Loading expenses" })).toBeInTheDocument();
    expect(screen.queryByText("Airport cab")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Search expenses")).toHaveValue("");

    await act(async () => reopened.resolve({ expenses: [lunch] }));
    expect(await screen.findByText("Team lunch")).toBeInTheDocument();
    expect(screen.queryByText("Airport cab")).not.toBeInTheDocument();
    // Let the search debounce run out: still only the one unfiltered request.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith(`/api/trips/${TRIP_ID}/candidates`);
  });
});
