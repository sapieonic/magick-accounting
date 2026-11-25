import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TripDetailPage from "./page";
import { ApiError, api } from "@/lib/api";
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

vi.mock("@/lib/api", async (importOriginal) => ({
  ApiError: (await importOriginal<typeof import("@/lib/api")>()).ApiError,
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

// Tests that check which rows offer actions render the real timeline.
let realTimeline = false;

// The timeline is built separately; this stand-in exposes its callbacks.
vi.mock("@/components/trips/TripTimeline", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/trips/TripTimeline")>();
  return {
    default: (props: any) => {
      timelineProps(props);
      if (realTimeline) return <actual.default {...props} />;
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
              {props.review?.onApprove && expense.approvalStatus === "pending" && (
                <button type="button" onClick={() => props.review.onApprove(expense)}>
                  Approve {expense.title}
                </button>
              )}
              {props.review?.onReopen && expense.approvalStatus === "approved" && (
                <button type="button" onClick={() => props.review.onReopen(expense)}>
                  Reopen {expense.title}
                </button>
              )}
            </li>
          ))}
        </ul>
      );
    },
  };
});

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

function asMasterAdmin() {
  vi.mocked(useAuth).mockReturnValue({ user: { ...me, role: "master_admin" }, isAdmin: true, isMasterAdmin: true } as any);
}

// The fixtures' trip dates are fixed, while the pages derive each trip's
// status from today's date, so pin "today" to keep the expectations stable.
// Only Date is faked; timers and promises keep running normally.
const TODAY = new Date("2026-10-29T12:00:00Z");

describe("TripDetailPage", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: TODAY });
    vi.clearAllMocks();
    realTimeline = false;
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
    expect(types[0]).toHaveTextContent("56.0%");
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
    // Their total isn't the trip's, so it isn't measured against the trip budget.
    expect(screen.queryByRole("progressbar", { name: "Budget used" })).not.toBeInTheDocument();
    expect(screen.queryByText(/left$/)).not.toBeInTheDocument();
    expect(screen.queryByText("Total spend")).not.toBeInTheDocument();
    expect(screen.getByText("Your spend")).toBeInTheDocument();
    expect(screen.getByText("Where your money on this trip went.")).toBeInTheDocument();
  });

  it("passes the trip page to the timeline as the edit return path", async () => {
    render(<TripDetailPage />);
    await screen.findByTestId("trip-timeline");
    expect(timelineProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ returnTo: `/dashboard/trips/${TRIP_ID}` })
    );
  });

  it("ignores an earlier refresh that resolves after a newer one", async () => {
    const user = userEvent.setup();
    vi.mocked(api.put).mockResolvedValue({});
    render(<TripDetailPage />);
    await screen.findByTestId("trip-timeline");

    // The refresh after the removal is slow; the one after Undo comes back first.
    const withoutHotel = detail({
      expenses: [flight],
      summary: { ...detail().summary, totalAmount: 7000, expenseCount: 1, companyAmount: 0 },
    });
    let resolveSlow!: (value: TripDetailResponse) => void;
    const slow = new Promise<TripDetailResponse>((resolve) => {
      resolveSlow = resolve;
    });
    let tripGets = 0;
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === `/api/trips/${TRIP_ID}`) {
        tripGets += 1;
        return tripGets === 1 ? slow : Promise.resolve(detail());
      }
      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });

    await user.click(screen.getByRole("button", { name: "Remove Taj stay" }));
    await waitFor(() => expect(tripGets).toBe(1));
    const options = toastMock.mock.calls.find(([message]) => message === 'Removed "Taj stay" from this trip')![2];
    options.action.onClick();
    await waitFor(() => expect(tripGets).toBe(2));
    await waitFor(() => expect(screen.queryByText("Refreshing...")).not.toBeInTheDocument());

    await act(async () => resolveSlow(withoutHotel));
    expect(screen.getByTestId("trip-timeline")).toHaveTextContent("Taj stay");
    expect(screen.getByText(formatBaseCurrency(12500))).toBeInTheDocument();
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

  it("suggests unlinked expenses from the trip's days and adds one", async () => {
    const user = userEvent.setup();
    render(<TripDetailPage />);
    await screen.findByTestId("trip-timeline");

    const panel = await screen.findByRole("region", { name: "Might belong here" });
    await within(panel).findByText("Airport cab");
    await user.click(within(panel).getByRole("button", { name: "Add Airport cab to this trip" }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(`/api/trips/${TRIP_ID}/expenses`, { add: ["7".repeat(24)] })
    );
    expect(toastMock).toHaveBeenCalledWith('Added "Airport cab" to this trip');
    await waitFor(() =>
      expect(vi.mocked(api.get).mock.calls.filter(([url]) => url === `/api/trips/${TRIP_ID}`)).toHaveLength(2)
    );
  });

  it("keeps a suggestion's amount out of the clipped sub-line", async () => {
    render(<TripDetailPage />);

    const panel = await screen.findByRole("region", { name: "Might belong here" });
    await within(panel).findByText("Airport cab");
    const [amount] = within(panel).getAllByText(formatBaseCurrency(100));
    expect(amount).toHaveClass("whitespace-nowrap");
    expect(amount.closest(".ell")).toBeNull();
  });

  it("says so instead of loading forever when suggestions fail", async () => {
    const defaultGet = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation((url: string) =>
      url.startsWith(`/api/trips/${TRIP_ID}/candidates`) ? Promise.reject(new Error("offline")) : defaultGet(url)
    );
    render(<TripDetailPage />);

    const panel = await screen.findByRole("region", { name: "Might belong here" });
    expect(await within(panel).findByText(/suggestions couldn't be loaded/i)).toBeInTheDocument();
    expect(panel.querySelector(".animate-pulse")).toBeNull();
    expect(within(panel).getByRole("button", { name: /browse all unlinked/i })).toBeInTheDocument();
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
    // The fixtures are approved (legacy), which only the master admin may delete.
    asMasterAdmin();
    // Swap the Date-only fake clock for one that also controls timers.
    vi.useRealTimers();
    vi.useFakeTimers({ shouldAdvanceTime: true, now: TODAY });
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

  it("takes a shared bill's delete off each payer's own row", async () => {
    // The fixtures are approved (legacy), which only the master admin may delete.
    asMasterAdmin();
    vi.useRealTimers();
    vi.useFakeTimers({ shouldAdvanceTime: true, now: TODAY });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    // Manas paid 600 from pocket and Priya 400 on the company card.
    const dinner = makeExpense({
      _id: "3".repeat(24),
      title: "Team dinner",
      amount: 1000,
      amountInBaseCurrency: 1000,
      paymentSource: "multiple",
      pocketAmount: 600,
      pocketAmountInBaseCurrency: 600,
      travelType: "food",
      payments: [
        { paidBy: me, amount: 600, amountInBaseCurrency: 600, source: "pocket" },
        { paidBy: priya, amount: 400, amountInBaseCurrency: 400, source: "company" },
      ],
    });
    const base = detail();
    response = detail({
      expenses: [flight, hotel, dinner],
      summary: {
        ...base.summary,
        totalAmount: 13500,
        expenseCount: 3,
        pocketAmount: 7600,
        companyAmount: 5900,
        byType: [...base.summary.byType, { travelType: "food", total: 1000, count: 1 }],
        byPayer: [
          { user: me, totalSpend: 7600, pocketSpend: 7600, companySpend: 0 },
          { user: priya, totalSpend: 5900, pocketSpend: 0, companySpend: 5900 },
        ],
      },
    });
    render(<TripDetailPage />);
    await screen.findByTestId("trip-timeline");
    const payerTexts = () => screen.getAllByTestId("payer-row").map((row) => row.textContent);
    expect(payerTexts()[0]).toContain(`${formatBaseCurrency(7600)} total`);

    await user.click(screen.getByRole("button", { name: "Delete Team dinner" }));

    const [manas, priyaRow] = payerTexts();
    expect(manas).toContain(`${formatBaseCurrency(7000)} total · ${formatBaseCurrency(0)} company`);
    expect(manas).toContain(formatBaseCurrency(7000));
    expect(priyaRow).toContain(`${formatBaseCurrency(5500)} total · ${formatBaseCurrency(5500)} company`);
    expect(api.delete).not.toHaveBeenCalled();
  });

  it("refreshes the suggestions once per reload, not on every change to the loaded trip", async () => {
    // The fixtures are approved (legacy), which only the master admin may delete.
    asMasterAdmin();
    vi.useRealTimers();
    vi.useFakeTimers({ shouldAdvanceTime: true, now: TODAY });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const candidateCalls = () =>
      vi.mocked(api.get).mock.calls.filter(([url]) => url === `/api/trips/${TRIP_ID}/candidates`).length;
    render(<TripDetailPage />);
    await screen.findByTestId("trip-timeline");
    await waitFor(() => expect(candidateCalls()).toBe(1));

    // Hold the reload after the delete so the optimistic update renders first.
    let release!: () => void;
    const defaultGet = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation((url: string) =>
      url === `/api/trips/${TRIP_ID}`
        ? new Promise((resolve) => {
            release = () => resolve(response);
          })
        : defaultGet(url)
    );
    await user.click(screen.getByRole("button", { name: "Delete IndiGo BOM" }));
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith(`/api/expenses/${flight._id}`));
    await waitFor(() =>
      expect(vi.mocked(api.get).mock.calls.filter(([url]) => url === `/api/trips/${TRIP_ID}`)).toHaveLength(2)
    );
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(candidateCalls()).toBe(1);

    await act(async () => release());
    await waitFor(() => expect(candidateCalls()).toBe(2));
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(candidateCalls()).toBe(2);
  });

  it("sends a delete once, and keeps it hidden, when Undo or leaving the page comes while it is in flight", async () => {
    // The fixtures are approved (legacy), which only the master admin may delete.
    asMasterAdmin();
    vi.useRealTimers();
    vi.useFakeTimers({ shouldAdvanceTime: true, now: TODAY });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    let finishDelete!: () => void;
    vi.mocked(api.delete).mockImplementation(
      () =>
        new Promise((resolve) => {
          finishDelete = () => resolve({ message: "ok" });
        })
    );
    const { unmount } = render(<TripDetailPage />);
    await screen.findByTestId("trip-timeline");

    await user.click(screen.getByRole("button", { name: "Delete IndiGo BOM" }));
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(api.delete).toHaveBeenCalledTimes(1);

    // Undo once the request is out: it can't stop the delete, so the expense stays hidden.
    const options = toastMock.mock.calls.find(([message]) => message === 'Deleted "IndiGo BOM"')?.[2];
    act(() => options.action.onClick());
    expect(screen.getByTestId("trip-timeline")).not.toHaveTextContent("IndiGo BOM");
    expect(screen.queryByText(formatBaseCurrency(12500))).not.toBeInTheDocument();

    // Leaving the page doesn't send it again.
    unmount();
    await act(async () => finishDelete());
    expect(api.delete).toHaveBeenCalledTimes(1);
  });

  it("commits a delete still in its undo window when leaving the page", async () => {
    // The fixtures are approved (legacy), which only the master admin may delete.
    asMasterAdmin();
    vi.useRealTimers();
    vi.useFakeTimers({ shouldAdvanceTime: true, now: TODAY });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { unmount } = render(<TripDetailPage />);
    await screen.findByTestId("trip-timeline");

    await user.click(screen.getByRole("button", { name: "Delete IndiGo BOM" }));
    expect(api.delete).not.toHaveBeenCalled();
    unmount();
    expect(api.delete).toHaveBeenCalledWith(`/api/expenses/${flight._id}`);
    await act(async () => {
      vi.advanceTimersByTime(6000);
    });
    expect(api.delete).toHaveBeenCalledTimes(1);
  });

  it("restores an expense when the delete is undone", async () => {
    // The fixtures are approved (legacy), which only the master admin may delete.
    asMasterAdmin();
    // Swap the Date-only fake clock for one that also controls timers.
    vi.useRealTimers();
    vi.useFakeTimers({ shouldAdvanceTime: true, now: TODAY });
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
  describe("approval", () => {
    const cab = makeExpense({
      _id: "3".repeat(24),
      title: "Airport cab",
      amount: 800,
      amountInBaseCurrency: 800,
      pocketAmount: 800,
      pocketAmountInBaseCurrency: 800,
      travelType: "cab",
      approvalStatus: "pending",
    });
    const dinner = makeExpense({
      _id: "4".repeat(24),
      title: "Team dinner",
      amount: 900,
      amountInBaseCurrency: 900,
      travelType: "food",
      approvalStatus: "rejected",
    });

    beforeEach(() => {
      // Another admin reviews: the cab is Manas's own (admins can't review their own).
      vi.mocked(useAuth).mockReturnValue({ user: { ...priya, role: "admin" }, isAdmin: true } as any);
      response = detail({
        expenses: [flight, hotel, cab, dinner],
        summary: { ...detail().summary, pendingCount: 1, pendingAmount: 800 },
      });
    });

    it("says what the total leaves out and shows it on the budget", async () => {
      render(<TripDetailPage />);

      const totals = await screen.findByRole("region", { name: "Trip totals" });
      expect(within(totals).getByText(formatBaseCurrency(12500))).toBeInTheDocument();
      expect(totals).toHaveTextContent("2 approved expenses ·");
      expect(totals).toHaveTextContent(`Excludes ${formatBaseCurrency(800)} awaiting approval (1 expense)`);
      const meter = within(totals).getByRole("progressbar", { name: "Budget used" });
      expect(meter).toHaveAttribute("aria-valuenow", "63");
      expect(meter).toHaveAttribute("aria-valuetext", `63%, plus ${formatBaseCurrency(800)} awaiting approval`);
      expect(within(totals).getByTestId("budget-pending")).toHaveStyle({ width: "4%" });
      // Every expense is still listed.
      expect(screen.getByTestId("trip-timeline")).toHaveTextContent("Airport cab");
      expect(screen.getByTestId("trip-timeline")).toHaveTextContent("Team dinner");
    });

    it("says nothing about approval when nothing is waiting", async () => {
      response = detail();
      render(<TripDetailPage />);

      const totals = await screen.findByRole("region", { name: "Trip totals" });
      expect(totals).not.toHaveTextContent(/awaiting approval/);
      expect(totals).toHaveTextContent("2 expenses ·");
      expect(within(totals).queryByTestId("budget-pending")).not.toBeInTheDocument();
    });

    it("moves a deleted pending expense out of the pending figure only", async () => {
      const user = userEvent.setup();
      render(<TripDetailPage />);
      const totals = await screen.findByRole("region", { name: "Trip totals" });

      await user.click(screen.getByRole("button", { name: "Delete Airport cab" }));

      expect(within(totals).getByText(formatBaseCurrency(12500))).toBeInTheDocument();
      expect(totals).not.toHaveTextContent(/awaiting approval/);
      expect(within(totals).getByText(formatBaseCurrency(7000))).toBeInTheDocument(); // pocket unchanged
      expect(screen.getAllByTestId("payer-row")[0]).toHaveTextContent(formatBaseCurrency(7000));
    });

    it("moves an approved expense into the trip total, then reloads the server's summary", async () => {
      const approvedCab = { ...cab, approvalStatus: "approved" as const };
      vi.mocked(api.post).mockResolvedValue({ expense: approvedCab });
      render(<TripDetailPage />);
      const totals = await screen.findByRole("region", { name: "Trip totals" });
      expect(timelineProps).toHaveBeenLastCalledWith(
        expect.objectContaining({ review: expect.objectContaining({ viewerId: PRIYA }) })
      );

      // Fake the undo window's timer too (the suite fakes only Date).
      vi.useRealTimers();
      vi.useFakeTimers({ now: TODAY });
      act(() => {
        screen.getByRole("button", { name: "Approve Airport cab" }).click();
      });
      // In the totals at once, with Undo.
      expect(within(totals).getByText(formatBaseCurrency(13300))).toBeInTheDocument();
      expect(totals).not.toHaveTextContent(/awaiting approval/);
      expect(within(totals).getByText(formatBaseCurrency(7800))).toBeInTheDocument(); // from pocket
      expect(screen.getAllByTestId("payer-row")[0]).toHaveTextContent(formatBaseCurrency(7800));
      expect(screen.getAllByTestId("type-row")).toHaveLength(3);
      expect(api.post).not.toHaveBeenCalled();

      response = detail({
        expenses: [flight, hotel, approvedCab, dinner],
        summary: {
          ...detail().summary,
          totalAmount: 13300,
          expenseCount: 3,
          pocketAmount: 7800,
          pendingCount: 0,
          pendingAmount: 0,
        },
      });
      const tripLoads = () => vi.mocked(api.get).mock.calls.filter(([url]) => url === `/api/trips/${TRIP_ID}`).length;
      const loadsBefore = tripLoads();
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });
      await act(async () => {
        await Promise.resolve();
      });
      vi.useRealTimers();

      expect(api.post).toHaveBeenCalledWith(`/api/expenses/${cab._id}/approval`, { action: "approve", revision: 0 });
      await waitFor(() => expect(tripLoads()).toBe(loadsBefore + 1));
      expect(within(totals).getByText(formatBaseCurrency(13300))).toBeInTheDocument();
      expect(totals).toHaveTextContent("3 expenses ·");
    });

    it("puts the totals back when an approve is undone", async () => {
      render(<TripDetailPage />);
      const totals = await screen.findByRole("region", { name: "Trip totals" });
      act(() => {
        screen.getByRole("button", { name: "Approve Airport cab" }).click();
      });
      expect(within(totals).getByText(formatBaseCurrency(13300))).toBeInTheDocument();
      act(() => toastMock.mock.calls.at(-1)![2].action.onClick());
      expect(within(totals).getByText(formatBaseCurrency(12500))).toBeInTheDocument();
      expect(totals).toHaveTextContent(`Excludes ${formatBaseCurrency(800)} awaiting approval`);
    });

    it("won't delete an expense while its approve can still be undone", async () => {
      render(<TripDetailPage />);
      await screen.findByRole("region", { name: "Trip totals" });
      act(() => {
        screen.getByRole("button", { name: "Approve Airport cab" }).click();
      });
      // The timeline withdraws Delete meanwhile; a stale click is refused in words.
      act(() => {
        screen.getByRole("button", { name: "Delete Airport cab" }).click();
      });
      expect(toastMock).toHaveBeenLastCalledWith(
        "This expense's review is still being saved. Undo it first, or wait a few seconds, then delete it.",
        "info"
      );
      expect(screen.getByTestId("trip-timeline")).toHaveTextContent("Airport cab");
      expect(api.delete).not.toHaveBeenCalled();
    });

    it("moves an expense moved back to review out of the trip total", async () => {
      const approvedCab = { ...cab, approvalStatus: "approved" as const };
      response = detail({
        expenses: [flight, hotel, approvedCab, dinner],
        summary: {
          ...detail().summary,
          totalAmount: 13300,
          expenseCount: 3,
          pocketAmount: 7800,
          byType: [
            { travelType: "flight", total: 7000, count: 1 },
            { travelType: "stay", total: 5500, count: 1 },
            { travelType: "cab", total: 800, count: 1 },
          ],
          byPayer: [
            { user: me, totalSpend: 7800, pocketSpend: 7800, companySpend: 0 },
            { user: priya, totalSpend: 5500, pocketSpend: 0, companySpend: 5500 },
          ],
          pendingCount: 0,
          pendingAmount: 0,
        },
      });
      render(<TripDetailPage />);
      const totals = await screen.findByRole("region", { name: "Trip totals" });
      expect(within(totals).getByText(formatBaseCurrency(13300))).toBeInTheDocument();

      vi.mocked(api.post).mockResolvedValue({ expense: { ...approvedCab, approvalStatus: "pending" } });
      // The summary the page reloads afterwards: the server agrees.
      const reloaded = detail({
        expenses: [flight, hotel, cab, dinner],
        summary: { ...detail().summary, pendingCount: 1, pendingAmount: 800 },
      });
      await userEvent.click(screen.getByRole("button", { name: "Reopen Airport cab" }));
      const dialog = screen.getByRole("dialog", { name: "Move back to review" });
      const before = vi.mocked(api.get).mock.calls.length;
      // Hold the reload so the optimistic figures can be checked first.
      let release!: () => void;
      vi.mocked(api.get).mockImplementationOnce(
        () => new Promise((resolve) => (release = () => resolve(reloaded)))
      );
      await userEvent.click(within(dialog).getByRole("button", { name: "Move back to review" }));

      await waitFor(() =>
        expect(api.post).toHaveBeenCalledWith(`/api/expenses/${cab._id}/approval`, expect.objectContaining({ action: "reopen" }))
      );
      await waitFor(() => expect(vi.mocked(api.get).mock.calls.length).toBeGreaterThan(before));
      expect(within(totals).getByText(formatBaseCurrency(12500))).toBeInTheDocument();
      expect(totals).toHaveTextContent(`Excludes ${formatBaseCurrency(800)} awaiting approval (1 expense)`);
      expect(screen.getAllByTestId("type-row")).toHaveLength(2);
      expect(screen.getAllByTestId("payer-row")[0]).toHaveTextContent(formatBaseCurrency(7000));
      await act(async () => release());
      expect(within(totals).getByText(formatBaseCurrency(12500))).toBeInTheDocument();
    });

    it("won't delete an approved expense for an admin, and says only the master admin can", async () => {
      const user = userEvent.setup();
      render(<TripDetailPage />);
      await screen.findByTestId("trip-timeline");

      await user.click(screen.getByRole("button", { name: "Delete IndiGo BOM" }));

      expect(toastMock).toHaveBeenCalledWith(
        "Approved expenses are part of the books, so only the master admin can delete them.",
        "info"
      );
      expect(screen.getByTestId("trip-timeline")).toHaveTextContent("IndiGo BOM");
      expect(toastMock).not.toHaveBeenCalledWith('Deleted "IndiGo BOM"', expect.anything(), expect.anything());
    });

    it("puts the expense and the totals back when the server refuses the delete (approved meanwhile)", async () => {
      vi.useRealTimers();
      vi.useFakeTimers({ shouldAdvanceTime: true, now: TODAY });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      vi.mocked(api.delete).mockRejectedValue(
        new ApiError("Approved expenses are part of the books, so only the master admin can delete them.", 403, {
          code: "approved_locked",
        })
      );
      render(<TripDetailPage />);
      const totals = await screen.findByRole("region", { name: "Trip totals" });
      const tripLoads = () => vi.mocked(api.get).mock.calls.filter(([url]) => url === `/api/trips/${TRIP_ID}`).length;
      expect(tripLoads()).toBe(1);

      await user.click(screen.getByRole("button", { name: "Delete Team dinner" }));
      expect(screen.getByTestId("trip-timeline")).not.toHaveTextContent("Team dinner");
      await user.click(screen.getByRole("button", { name: "Delete Airport cab" }));
      expect(totals).not.toHaveTextContent(/awaiting approval/);

      await act(async () => {
        vi.advanceTimersByTime(5000);
      });

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          "Approved expenses are part of the books, so only the master admin can delete them.",
          "error"
        )
      );
      // Both are listed again, and the pending figure is back.
      await waitFor(() => expect(screen.getByTestId("trip-timeline")).toHaveTextContent("Airport cab"));
      expect(screen.getByTestId("trip-timeline")).toHaveTextContent("Team dinner");
      expect(totals).toHaveTextContent(`Excludes ${formatBaseCurrency(800)} awaiting approval`);
      expect(within(totals).getByText(formatBaseCurrency(12500))).toBeInTheDocument();
      // And the trip is read again, so the rows show what the server has now.
      await waitFor(() => expect(tripLoads()).toBeGreaterThan(1));
    });

    it("leaves every total alone when a rejected expense is deleted", async () => {
      const user = userEvent.setup();
      render(<TripDetailPage />);
      const totals = await screen.findByRole("region", { name: "Trip totals" });

      await user.click(screen.getByRole("button", { name: "Delete Team dinner" }));

      expect(within(totals).getByText(formatBaseCurrency(12500))).toBeInTheDocument();
      expect(totals).toHaveTextContent(`Excludes ${formatBaseCurrency(800)} awaiting approval`);
      expect(screen.getAllByTestId("type-row")).toHaveLength(2);
    });
  });

  describe("a shared bill on a regular user's trip page", () => {
    // Manas (a user) sees three expenses on this trip:
    // (a) his own pocket expense, ₹800.00 (legacy: approved);
    const metro = makeExpense({
      _id: "4".repeat(24),
      title: "Metro card",
      amount: 800,
      amountInBaseCurrency: 800,
      pocketAmount: 800,
      pocketAmountInBaseCurrency: 800,
      travelType: "cab",
    });
    // (b) a ₹3,000.00 dinner he submitted: he paid ₹1,250.50 from pocket and
    //     ₹400.00 on the company card, Priya ₹1,349.50 from pocket (legacy:
    //     approved; his page shows it awaiting approval);
    const dinner = makeExpense({
      _id: "5".repeat(24),
      title: "Client dinner",
      amount: 3000,
      amountInBaseCurrency: 3000,
      paymentSource: "multiple",
      pocketAmount: 2600,
      pocketAmountInBaseCurrency: 2600,
      travelType: "food",
      payments: [
        { paidBy: me, amount: 1250.5, amountInBaseCurrency: 1250.5, source: "pocket" },
        { paidBy: me, amount: 400, amountInBaseCurrency: 400, source: "company" },
        { paidBy: priya, amount: 1349.5, amountInBaseCurrency: 1349.5, source: "pocket" },
      ],
    });
    // (c) Priya's ₹5,500.75 hotel: she paid ₹4,000.00 from pocket, he ₹1,500.75 on the company card (legacy: approved).
    const pune = makeExpense({
      _id: "6".repeat(24),
      title: "Hotel Pune",
      amount: 5500.75,
      amountInBaseCurrency: 5500.75,
      date: "2026-10-27T00:00:00.000Z",
      paymentSource: "multiple",
      pocketAmount: 4000,
      pocketAmountInBaseCurrency: 4000,
      travelType: "stay",
      createdBy: priya,
      payments: [
        { paidBy: priya, amount: 4000, amountInBaseCurrency: 4000, source: "pocket" },
        { paidBy: me, amount: 1500.75, amountInBaseCurrency: 1500.75, source: "company" },
      ],
    });

    const statValue = (label: string) => screen.getByText(label).nextElementSibling?.textContent;
    const statSub = (label: string) => screen.getByText(label).nextElementSibling?.nextElementSibling?.textContent;
    const typeTexts = () => screen.getAllByTestId("type-row").map((row) => row.textContent);
    // Each Who-paid row reads: avatar initial, name, "<total> total · <company> company", then what's owed.
    const payerTexts = () => screen.getAllByTestId("payer-row").map((row) => row.textContent);
    const figures = () => ({
      stats: ["Your spend", "Trip total", "Company paid", "From pocket", "Per traveller"]
        .filter((label) => screen.queryByText(label))
        .map((label) => [label, statValue(label), statSub(label)]),
      types: typeTexts(),
      payers: payerTexts(),
    });

    beforeEach(() => {
      realTimeline = true;
      vi.useRealTimers();
      vi.useFakeTimers({ shouldAdvanceTime: true, now: TODAY });
    });

    // On the user's page the dinner awaits approval, so it is out of his totals
    // and only his ₹1,650.50 share of it is reported as pending.
    const pendingDinner = { ...dinner, approvalStatus: "pending" as const };

    function signInAsUser(dinnerStatus: "pending" | "rejected" = "pending") {
      vi.mocked(useAuth).mockReturnValue({ user: { ...me, role: "user" }, isAdmin: false } as any);
      const base = detail();
      // As the server counts it for Manas: only his share, and only his own Who-paid row.
      // Approved: 800 + 1,500.75 = 2,300.75; pocket 800; company 1,500.75.
      // Awaiting approval: his 1,250.50 + 400.00 of the dinner = 1,650.50.
      const pending = dinnerStatus === "pending";
      response = detail({
        trip: { ...base.trip, canManage: false, expenseCount: 2, totalAmount: 2300.75 },
        expenses: [metro, { ...dinner, approvalStatus: dinnerStatus }, pune],
        summary: {
          totalAmount: 2300.75,
          expenseCount: 2,
          pocketAmount: 800,
          companyAmount: 1500.75,
          byType: [
            { travelType: "stay", total: 1500.75, count: 1 },
            { travelType: "cab", total: 800, count: 1 },
          ],
          byPayer: [{ user: me, totalSpend: 2300.75, pocketSpend: 800, companySpend: 1500.75 }],
          pendingCount: pending ? 1 : 0,
          pendingAmount: pending ? 1650.5 : 0,
        },
      });
    }

    it("offers edit, remove and delete only on the expenses the user submitted", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      signInAsUser();
      render(<TripDetailPage />);
      await screen.findByTestId("trip-timeline");

      expect(timelineProps).toHaveBeenLastCalledWith(expect.objectContaining({ canModify: expect.any(Function) }));
      for (const expense of [metro, dinner]) {
        expect(screen.getByRole("link", { name: `Edit ${expense.title}` })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: `Remove ${expense.title} from trip` })).toBeInTheDocument();
      }
      // His pending dinner can go; his approved metro card is in the books (master admin only).
      expect(screen.getByRole("button", { name: `Delete ${dinner.title}` })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: `Delete ${metro.title}` })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Hotel Pune" })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Edit Hotel Pune" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Remove Hotel Pune from trip" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Delete Hotel Pune" })).not.toBeInTheDocument();

      // Opened, Priya's hotel is read-only to him.
      await user.click(screen.getByRole("button", { name: "Hotel Pune" }));
      const hotelDetail = document.getElementById(`expense-detail-${pune._id}`)!;
      expect(hotelDetail).toBeInTheDocument();
      expect(within(hotelDetail).queryByRole("link", { name: "Edit" })).not.toBeInTheDocument();
      expect(within(hotelDetail).queryByRole("button", { name: "Remove from trip" })).not.toBeInTheDocument();
      expect(within(hotelDetail).queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
      expect(within(hotelDetail).queryByText(/only the master admin can delete/)).not.toBeInTheDocument();

      // His own shared dinner opens with its actions.
      await user.click(screen.getByRole("button", { name: "Client dinner" }));
      const dinnerDetail = document.getElementById(`expense-detail-${dinner._id}`)!;
      expect(within(dinnerDetail).getByText("Awaiting approval")).toBeInTheDocument();
      expect(within(dinnerDetail).getByRole("link", { name: "Edit" })).toBeInTheDocument();
      expect(within(dinnerDetail).getByRole("button", { name: "Remove from trip" })).toBeInTheDocument();
      expect(within(dinnerDetail).getByRole("button", { name: "Delete" })).toBeInTheDocument();
    });

    it("takes only the user's own share of a deleted pending shared bill out of awaiting approval, and undo restores it", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      signInAsUser();
      render(<TripDetailPage />);
      await screen.findByTestId("trip-timeline");
      const totals = screen.getByRole("region", { name: "Trip totals" });

      // 4 days (27–30 Oct): 2,300.75 / 4 = 575.1875.
      expect(statValue("Your spend")).toBe("₹2,300.75");
      expect(statSub("Your spend")).toMatch(/^2 approved expenses · ≈ ₹575\.19 per day/);
      expect(statValue("From pocket")).toBe("₹800.00");
      expect(statValue("Company paid")).toBe("₹1,500.75");
      expect(screen.queryByText("Per traveller")).not.toBeInTheDocument();
      // His share of the dinner, not the whole ₹3,000.00.
      expect(totals).toHaveTextContent(`Excludes ${formatBaseCurrency(1650.5)} awaiting approval (1 expense)`);
      const types = screen.getAllByTestId("type-row");
      expect(types).toHaveLength(2);
      expect(types[0]).toHaveTextContent(/^Stay1 item65\.2%₹1,500\.75/);
      expect(types[1]).toHaveTextContent(/^Cab \/ local1 item34\.8%₹800\.00/);
      expect(payerTexts()).toEqual(["MManas₹2,300.75 total · ₹1,500.75 companyOwed₹800.00"]);
      // The amounts (each stat's sub-line also says whether anything awaits approval).
      const amounts = () => ({ ...figures(), stats: figures().stats.map(([label, value]) => [label, value]) });
      const before = amounts();

      await user.click(screen.getByRole("button", { name: "Delete Client dinner" }));

      expect(screen.getByTestId("trip-timeline")).not.toHaveTextContent("Client dinner");
      expect(totals).not.toHaveTextContent(/awaiting approval/);
      // It was never in his totals.
      expect(amounts()).toEqual(before);
      expect(api.delete).not.toHaveBeenCalled();

      const options = toastMock.mock.calls.find(([message]) => message === 'Deleted "Client dinner"')?.[2];
      act(() => options.action.onClick());

      expect(screen.getByTestId("trip-timeline")).toHaveTextContent("Client dinner");
      expect(totals).toHaveTextContent(`Excludes ${formatBaseCurrency(1650.5)} awaiting approval (1 expense)`);
      expect(amounts()).toEqual(before);
      await act(async () => {
        vi.advanceTimersByTime(6000);
      });
      expect(api.delete).not.toHaveBeenCalled();
    });

    it("moves only the user's own share into awaiting approval when they resubmit their shared bill", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      signInAsUser("rejected");
      const rejected = response.expenses.find((e) => e._id === dinner._id)!;
      vi.mocked(api.post).mockResolvedValue({ expense: { ...rejected, approvalStatus: "pending" } });
      render(<TripDetailPage />);
      await screen.findByTestId("trip-timeline");
      const totals = screen.getByRole("region", { name: "Trip totals" });
      expect(totals).not.toHaveTextContent(/awaiting approval/);
      const before = figures();
      // The reload after the resubmit doesn't land, so what shows is the page's own shift.
      vi.mocked(api.get).mockImplementation(() => new Promise(() => {}));

      await user.click(screen.getByRole("button", { name: "Client dinner" }));
      const dinnerDetail = document.getElementById(`expense-detail-${dinner._id}`)!;
      await user.click(within(dinnerDetail).getByRole("button", { name: "Resubmit as is…" }));
      await user.click(within(screen.getByRole("dialog", { name: "Resubmit for approval" })).getByRole("button", { name: "Resubmit" }));

      await waitFor(() =>
        expect(totals).toHaveTextContent(`Excludes ${formatBaseCurrency(1650.5)} awaiting approval (1 expense)`)
      );
      // The approved figures stay as they were.
      expect(statValue("Your spend")).toBe("₹2,300.75");
      expect(statValue("From pocket")).toBe("₹800.00");
      expect(statValue("Company paid")).toBe("₹1,500.75");
      expect({ types: typeTexts(), payers: payerTexts() }).toEqual({ types: before.types, payers: before.payers });
    });

    it("takes the whole bill, and each payer's share, off an admin's totals", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      // Approved spend (legacy included) is only the master admin's to delete.
      vi.mocked(useAuth).mockReturnValue({ user: { ...me, role: "master_admin" }, isAdmin: true, isMasterAdmin: true } as any);
      const base = detail();
      // Whole expenses: total 800 + 3,000 + 5,500.75 = 9,300.75; pocket 800 + 2,600 + 4,000 = 7,400;
      // company 400 + 1,500.75 = 1,900.75. Priya: 1,349.50 + 4,000 pocket. Manas: 2,050.50 pocket,
      // 1,900.75 company.
      response = detail({
        trip: { ...base.trip, expenseCount: 3, totalAmount: 9300.75 },
        expenses: [metro, dinner, pune],
        summary: {
          totalAmount: 9300.75,
          expenseCount: 3,
          pocketAmount: 7400,
          companyAmount: 1900.75,
          byType: [
            { travelType: "stay", total: 5500.75, count: 1 },
            { travelType: "food", total: 3000, count: 1 },
            { travelType: "cab", total: 800, count: 1 },
          ],
          byPayer: [
            { user: priya, totalSpend: 5349.5, pocketSpend: 5349.5, companySpend: 0 },
            { user: me, totalSpend: 3951.25, pocketSpend: 2050.5, companySpend: 1900.75 },
          ],
        },
      });
      render(<TripDetailPage />);
      await screen.findByTestId("trip-timeline");

      // The master admin may change (and delete) any of them.
      for (const expense of [metro, dinner, pune]) {
        expect(screen.getByRole("button", { name: `Delete ${expense.title}` })).toBeInTheDocument();
      }
      expect(statValue("Trip total")).toBe("₹9,300.75");
      expect(statValue("From pocket")).toBe("₹7,400.00");
      expect(statValue("Company paid")).toBe("₹1,900.75");
      // 9,300.75 / 2 = 4,650.375.
      expect(statValue("Per traveller")).toBe("₹4,650.38");
      expect(payerTexts()).toEqual([
        "PPriya₹5,349.50 total · ₹0.00 companyOwed₹5,349.50",
        "MManas₹3,951.25 total · ₹1,900.75 companyOwed₹2,050.50",
      ]);
      const before = figures();

      await user.click(screen.getByRole("button", { name: "Delete Client dinner" }));

      expect(statValue("Trip total")).toBe("₹6,300.75");
      expect(statSub("Trip total")).toBe("2 expenses · ≈ ₹1,575.19 per day");
      expect(statValue("From pocket")).toBe("₹4,800.00");
      expect(statValue("Company paid")).toBe("₹1,500.75");
      // 6,300.75 / 2 = 3,150.375.
      expect(statValue("Per traveller")).toBe("₹3,150.38");
      const types = screen.getAllByTestId("type-row");
      expect(types).toHaveLength(2);
      expect(types[0]).toHaveTextContent(/^Stay1 item87\.3%₹5,500\.75/);
      expect(types[1]).toHaveTextContent(/^Cab \/ local1 item12\.7%₹800\.00/);
      expect(payerTexts()).toEqual([
        "PPriya₹4,000.00 total · ₹0.00 companyOwed₹4,000.00",
        "MManas₹2,300.75 total · ₹1,500.75 companyOwed₹800.00",
      ]);
      expect(api.delete).not.toHaveBeenCalled();

      const options = toastMock.mock.calls.find(([message]) => message === 'Deleted "Client dinner"')?.[2];
      act(() => options.action.onClick());
      expect(figures()).toEqual(before);
    });
  });
});
