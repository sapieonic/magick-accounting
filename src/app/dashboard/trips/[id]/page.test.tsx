import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TripDetailPage from "./page";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { formatBaseCurrency } from "@/lib/currency";
import type { ExpenseListItem } from "@/types/expense";
import type { TripDetailResponse } from "@/types/trip";

const pushMock = vi.fn();
const router = { push: pushMock };
const toastMock = vi.fn();
const timelineProps = vi.fn();

const TRIP_ID = "f".repeat(24);
const ME = "a".repeat(24);
const PRIYA = "b".repeat(24);

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => router),
  useParams: vi.fn(() => ({ id: "f".repeat(24) })),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/hooks/useTitle", () => ({
  useTitle: vi.fn(),
}));

vi.mock("@/components/ui/Toast", () => ({
  useToast: vi.fn(() => ({ toast: toastMock })),
}));

// The timeline is built separately; this stand-in exposes its callbacks.
vi.mock("@/components/trips/TripTimeline", () => ({
  default: (props: any) => {
    timelineProps(props);
    return (
      <ul data-testid="trip-timeline">
        {props.expenses.map((expense: ExpenseListItem) => (
          <li key={expense._id}>
            {expense.title}
            <button type="button" onClick={() => props.onDelete?.(expense)}>
              Delete {expense.title}
            </button>
            <button type="button" onClick={() => props.onRemoveFromTrip?.(expense)}>
              Remove {expense.title}
            </button>
          </li>
        ))}
      </ul>
    );
  },
}));

const me = { _id: ME, name: "Manas", email: "manas@example.com" };
const priya = { _id: PRIYA, name: "Priya", email: "priya@example.com" };

function makeExpense(overrides: Partial<ExpenseListItem>): ExpenseListItem {
  return {
    _id: "e".repeat(24),
    title: "Expense",
    amount: 100,
    amountInBaseCurrency: 100,
    date: "2026-10-28T00:00:00.000Z",
    description: "",
    paymentSource: "pocket",
    pocketAmount: 100,
    pocketAmountInBaseCurrency: 100,
    category: { _id: "c1", name: "Travel" },
    department: { _id: "d1", name: "Sales" },
    createdBy: me,
    trip: { _id: TRIP_ID, name: "Mumbai – Acme pitch" },
    travelType: "flight",
    ...overrides,
  };
}

const flight = makeExpense({
  _id: "1".repeat(24),
  title: "IndiGo BOM",
  amount: 7000,
  amountInBaseCurrency: 7000,
  pocketAmount: 7000,
  pocketAmountInBaseCurrency: 7000,
});
const hotel = makeExpense({
  _id: "2".repeat(24),
  title: "Taj stay",
  amount: 5500,
  amountInBaseCurrency: 5500,
  paymentSource: "company",
  pocketAmount: 0,
  pocketAmountInBaseCurrency: 0,
  travelType: "stay",
  createdBy: priya,
});

function detail(overrides: Partial<TripDetailResponse> = {}): TripDetailResponse {
  return {
    trip: {
      _id: TRIP_ID,
      name: "Mumbai – Acme pitch",
      destinations: ["Mumbai", "Pune"],
      startDate: "2026-10-27T00:00:00.000Z",
      endDate: "2026-10-30T00:00:00.000Z",
      travelers: [me, priya],
      status: "ongoing",
      purpose: "Acme Corp pitch",
      department: null,
      budget: 20000,
      notes: "",
      createdBy: me,
      expenseCount: 2,
      totalAmount: 12500,
      canManage: true,
    },
    summary: {
      totalAmount: 12500,
      expenseCount: 2,
      pocketAmount: 7000,
      companyAmount: 5500,
      byType: [
        { travelType: "flight", total: 7000, count: 1 },
        { travelType: "stay", total: 5500, count: 1 },
      ],
      byPayer: [
        { user: me, totalSpend: 7000, pocketSpend: 7000, companySpend: 0 },
        { user: priya, totalSpend: 5500, pocketSpend: 0, companySpend: 5500 },
      ],
    },
    expenses: [flight, hotel],
    ...overrides,
  };
}

let response: TripDetailResponse;

describe("TripDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, "", `/dashboard/trips/${TRIP_ID}`);
    response = detail();
    vi.mocked(useAuth).mockReturnValue({ user: { ...me, role: "admin" }, isAdmin: true } as any);
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.startsWith(`/api/trips/${TRIP_ID}/candidates`)) {
        return Promise.resolve({
          expenses: [
            makeExpense({ _id: "7".repeat(24), title: "Airport cab", trip: null, travelType: null }),
            makeExpense({ _id: "8".repeat(24), title: "Team lunch", trip: null, travelType: null }),
          ],
        });
      }
      if (url.startsWith(`/api/trips/${TRIP_ID}`)) return Promise.resolve(response);
      if (url.startsWith("/api/lookups")) return Promise.resolve({ members: [me, priya], departments: [] });
      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });
    vi.mocked(api.patch).mockResolvedValue({ added: 2, removed: 1 });
    vi.mocked(api.delete).mockResolvedValue({ message: "ok" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the trip header, stats, spend by type and who paid", async () => {
    render(<TripDetailPage />);

    expect(await screen.findByRole("heading", { name: "Mumbai – Acme pitch", level: 1 })).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith(`/api/trips/${TRIP_ID}`);
    expect(screen.getByText("Ongoing")).toBeInTheDocument();
    expect(screen.getByText("Mumbai → Pune")).toBeInTheDocument();
    expect(screen.getByText("Acme Corp pitch")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Add expense/ })).toHaveAttribute(
      "href",
      `/dashboard/expenses/new?trip=${TRIP_ID}`
    );

    expect(screen.getByText(formatBaseCurrency(12500))).toBeInTheDocument();
    expect(screen.getByText("Owed to travelers")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Budget used" })).toHaveAttribute("aria-valuenow", "63");

    const types = screen.getAllByTestId("type-row");
    expect(types).toHaveLength(2);
    expect(types[0]).toHaveTextContent("Flight");
    expect(types[0]).toHaveTextContent("56%");
    expect(types[1]).toHaveTextContent("Stay");

    const payers = screen.getAllByTestId("payer-row");
    expect(payers[0]).toHaveTextContent("Manas");
    expect(within(payers[0]).getByText("Owed")).toBeInTheDocument();
    expect(payers[1]).toHaveTextContent("Priya");
    expect(payers[1]).toHaveTextContent("Nothing owed");

    expect(screen.getByTestId("trip-timeline")).toHaveTextContent("IndiGo BOM");
    expect(screen.queryByText("Showing your expenses on this trip")).not.toBeInTheDocument();
  });

  it("notes that users only see their own expenses and hides manage actions", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { ...me, role: "user" }, isAdmin: false } as any);
    response = detail({ trip: { ...detail().trip, canManage: false } });
    render(<TripDetailPage />);

    expect(await screen.findByText("Showing your expenses on this trip")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete trip" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit trip" })).not.toBeInTheDocument();
  });

  it("passes ?expand= to the timeline", async () => {
    window.history.replaceState(null, "", `/dashboard/trips/${TRIP_ID}?expand=${hotel._id}`);
    render(<TripDetailPage />);
    await screen.findByTestId("trip-timeline");
    expect(timelineProps).toHaveBeenLastCalledWith(expect.objectContaining({ initialExpandedId: hotel._id }));
  });

  it("shows add buttons when the trip has no expenses", async () => {
    response = detail({
      expenses: [],
      summary: { totalAmount: 0, expenseCount: 0, pocketAmount: 0, companyAmount: 0, byType: [], byPayer: [] },
    });
    render(<TripDetailPage />);

    expect(await screen.findByText("No expenses on this trip yet")).toBeInTheDocument();
    expect(screen.queryByTestId("trip-timeline")).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Add expense/ })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /Add existing/ })).toHaveLength(2);
  });

  it("deletes the trip after confirmation and returns to Trips", async () => {
    const user = userEvent.setup();
    render(<TripDetailPage />);
    await screen.findByTestId("trip-timeline");

    await user.click(screen.getByRole("button", { name: "Delete trip" }));
    const dialog = screen.getByRole("dialog", { name: "Delete trip" });
    expect(dialog).toHaveTextContent("Expenses are kept");
    await user.click(within(dialog).getByRole("button", { name: "Delete trip" }));

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith(`/api/trips/${TRIP_ID}`));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/dashboard/trips"));
  });

  it("adds selected existing expenses to the trip", async () => {
    const user = userEvent.setup();
    render(<TripDetailPage />);
    await screen.findByTestId("trip-timeline");

    await user.click(screen.getByRole("button", { name: /Add existing/ }));
    const dialog = screen.getByRole("dialog", { name: "Add existing expenses" });
    await within(dialog).findByText("Airport cab");
    expect(api.get).toHaveBeenCalledWith(`/api/trips/${TRIP_ID}/candidates`);

    await user.click(within(dialog).getByRole("checkbox", { name: "Airport cab" }));
    await user.click(within(dialog).getByRole("checkbox", { name: "Team lunch" }));
    await user.click(within(dialog).getByRole("button", { name: "Add 2 to trip" }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(`/api/trips/${TRIP_ID}/expenses`, {
        add: ["7".repeat(24), "8".repeat(24)],
      })
    );
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add existing expenses" })).not.toBeInTheDocument());
    expect(toastMock).toHaveBeenCalledWith("Added 2 expenses to this trip");
    expect(vi.mocked(api.get).mock.calls.filter(([url]) => url === `/api/trips/${TRIP_ID}`)).toHaveLength(2);
  });

  it("selects every candidate with Select all", async () => {
    const user = userEvent.setup();
    render(<TripDetailPage />);
    await screen.findByTestId("trip-timeline");

    await user.click(screen.getByRole("button", { name: /Add existing/ }));
    const dialog = screen.getByRole("dialog", { name: "Add existing expenses" });
    await within(dialog).findByText("Airport cab");
    await user.click(within(dialog).getByRole("button", { name: /Select all/ }));
    expect(within(dialog).getByRole("button", { name: "Add 2 to trip" })).toBeEnabled();
  });

  it("removes an expense from the trip and refreshes", async () => {
    const user = userEvent.setup();
    render(<TripDetailPage />);
    await screen.findByTestId("trip-timeline");

    await user.click(screen.getByRole("button", { name: "Remove Taj stay" }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(`/api/trips/${TRIP_ID}/expenses`, { remove: [hotel._id] })
    );
    await waitFor(() =>
      expect(vi.mocked(api.get).mock.calls.filter(([url]) => url === `/api/trips/${TRIP_ID}`)).toHaveLength(2)
    );
    expect(toastMock).toHaveBeenCalledWith('Removed "Taj stay" from this trip', "success", expect.anything());
  });

  it("undoing a removal puts the expense back with its travel type", async () => {
    const user = userEvent.setup();
    vi.mocked(api.put).mockResolvedValue({});
    render(<TripDetailPage />);
    await screen.findByTestId("trip-timeline");

    await user.click(screen.getByRole("button", { name: "Remove Taj stay" }));
    await waitFor(() => expect(toastMock).toHaveBeenCalledWith('Removed "Taj stay" from this trip', "success", expect.anything()));
    const options = toastMock.mock.calls.find(([message]) => message === 'Removed "Taj stay" from this trip')![2];
    options.action.onClick();

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith(`/api/expenses/${hotel._id}`, {
        trip: TRIP_ID,
        travelType: hotel.travelType ?? null,
      })
    );
  });

  it("deletes an expense after the undo window, updating totals immediately", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<TripDetailPage />);
    await screen.findByTestId("trip-timeline");

    await user.click(screen.getByRole("button", { name: "Delete IndiGo BOM" }));

    expect(screen.getByTestId("trip-timeline")).not.toHaveTextContent("IndiGo BOM");
    // Total drops to the hotel alone and nothing is owed any more.
    expect(screen.getAllByText(formatBaseCurrency(5500)).length).toBeGreaterThan(0);
    expect(screen.queryByText(formatBaseCurrency(12500))).not.toBeInTheDocument();
    expect(toastMock).toHaveBeenCalledWith('Deleted "IndiGo BOM"', "info", expect.objectContaining({ durationMs: 5000 }));
    expect(api.delete).not.toHaveBeenCalled();

    response = detail({
      expenses: [hotel],
      summary: {
        totalAmount: 5500,
        expenseCount: 1,
        pocketAmount: 0,
        companyAmount: 5500,
        byType: [{ travelType: "stay", total: 5500, count: 1 }],
        byPayer: [{ user: priya, totalSpend: 5500, pocketSpend: 0, companySpend: 5500 }],
      },
    });
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith(`/api/expenses/${flight._id}`));
    await waitFor(() =>
      expect(vi.mocked(api.get).mock.calls.filter(([url]) => url === `/api/trips/${TRIP_ID}`)).toHaveLength(2)
    );
    expect(screen.getByTestId("trip-timeline")).not.toHaveTextContent("IndiGo BOM");
  });

  it("restores an expense when the delete is undone", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<TripDetailPage />);
    await screen.findByTestId("trip-timeline");

    await user.click(screen.getByRole("button", { name: "Delete IndiGo BOM" }));
    const options = toastMock.mock.calls.find(([message]) => message === 'Deleted "IndiGo BOM"')?.[2];
    act(() => options.action.onClick());

    expect(screen.getByTestId("trip-timeline")).toHaveTextContent("IndiGo BOM");
    expect(screen.getByText(formatBaseCurrency(12500))).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(6000);
    });
    expect(api.delete).not.toHaveBeenCalled();
  });
});
