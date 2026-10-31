import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TripsPage from "./page";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { formatBaseCurrency } from "@/lib/currency";
import type { TripListItem } from "@/types/trip";

const pushMock = vi.fn();
const router = { push: pushMock };
const toastMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => router),
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

const ME = "a".repeat(24);
const person = { _id: ME, name: "Manas", email: "manas@example.com" };

function makeTrip(overrides: Partial<TripListItem>): TripListItem {
  return {
    _id: "t".repeat(24),
    name: "Trip",
    destinations: [],
    startDate: "2026-10-28T00:00:00.000Z",
    endDate: "2026-10-30T00:00:00.000Z",
    travelers: [person],
    status: "ongoing",
    purpose: "",
    department: null,
    budget: null,
    notes: "",
    createdBy: person,
    expenseCount: 0,
    totalAmount: 0,
    canManage: true,
    ...overrides,
  };
}

const trips = [
  makeTrip({
    _id: "1".repeat(24),
    name: "Bengaluru client visit",
    status: "upcoming",
    startDate: "2026-12-01T00:00:00.000Z",
    endDate: "2026-12-03T00:00:00.000Z",
  }),
  makeTrip({
    _id: "2".repeat(24),
    name: "Mumbai – Acme pitch",
    status: "ongoing",
    destinations: ["Mumbai", "Pune"],
    expenseCount: 3,
    totalAmount: 9000,
    budget: 10000,
  }),
  makeTrip({
    _id: "3".repeat(24),
    name: "Delhi offsite",
    status: "completed",
    startDate: "2026-09-01T00:00:00.000Z",
    endDate: "2026-09-03T00:00:00.000Z",
    expenseCount: 1,
    totalAmount: 1234.5,
  }),
];

// The fixtures' trip dates are fixed, while the pages derive each trip's
// status from today's date, so pin "today" to keep the expectations stable.
// Only Date is faked; timers and promises keep running normally.
const TODAY = new Date("2026-10-29T12:00:00Z");

describe("TripsPage", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: TODAY });
    vi.clearAllMocks();
    window.history.replaceState(null, "", "/dashboard/trips");
    vi.mocked(useAuth).mockReturnValue({ user: { ...person, role: "user" }, isAdmin: false } as any);
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.startsWith("/api/lookups")) return Promise.resolve({ members: [person], departments: [] });
      return Promise.resolve({ trips });
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("groups trips into Ongoing, Upcoming and Past sections", async () => {
    render(<TripsPage />);

    const ongoing = await screen.findByRole("region", { name: "Ongoing" });
    const upcoming = screen.getByRole("region", { name: "Upcoming" });
    const past = screen.getByRole("region", { name: "Past" });

    expect(within(ongoing).getByText("Mumbai – Acme pitch")).toBeInTheDocument();
    expect(within(ongoing).getByText("Mumbai → Pune")).toBeInTheDocument();
    expect(within(ongoing).getByText(formatBaseCurrency(9000))).toBeInTheDocument();
    expect(within(ongoing).getByText("3 expenses")).toBeInTheDocument();
    // A user's total covers only their own expenses, so the trip budget isn't compared with it.
    expect(within(ongoing).queryByRole("progressbar", { name: "Budget used" })).not.toBeInTheDocument();
    expect(screen.getByText("Totals and expense counts include only your own expenses.")).toBeInTheDocument();
    expect(within(upcoming).getByText("Bengaluru client visit")).toBeInTheDocument();
    expect(within(past).getByText("Delhi offsite")).toBeInTheDocument();
    expect(within(past).getByText("1 expense")).toBeInTheDocument();

    expect(within(ongoing).getByRole("link")).toHaveAttribute("href", `/dashboard/trips/${"2".repeat(24)}`);
    expect(api.get).toHaveBeenCalledWith("/api/trips");
  });

  it("shows budget usage to admins", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { ...person, role: "admin" }, isAdmin: true } as any);
    render(<TripsPage />);

    const ongoing = await screen.findByRole("region", { name: "Ongoing" });
    // 90% of budget: shown as a warning.
    expect(within(ongoing).getByRole("progressbar", { name: "Budget used" })).toHaveAttribute("aria-valuenow", "90");
    expect(within(ongoing).getByText("90%")).toBeInTheDocument();
    expect(screen.queryByText("Totals and expense counts include only your own expenses.")).not.toBeInTheDocument();
  });

  it("shows the first-trip empty state", async () => {
    vi.mocked(api.get).mockImplementation((url: string) =>
      url.startsWith("/api/lookups") ? Promise.resolve({ members: [person] }) : Promise.resolve({ trips: [] })
    );
    render(<TripsPage />);

    expect(await screen.findByText("No trips yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Plan your first trip/ }));
    expect(screen.getByRole("dialog", { name: "New trip" })).toBeInTheDocument();
    // Let the people lookup settle before the test ends.
    expect(await screen.findByRole("button", { name: "Travelers" })).toHaveTextContent("Manas");
    await waitFor(() => expect(screen.getByLabelText("Department")).toHaveDisplayValue("No department"));
    await act(async () => {});
  });

  it("searches trips with ?q=", async () => {
    const user = userEvent.setup();
    render(<TripsPage />);
    await screen.findByText("Delhi offsite");

    await user.type(screen.getByLabelText("Search trips"), "mumbai");
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/api/trips?q=mumbai"));
    await waitFor(() => expect(window.location.search).toBe("?q=mumbai"));
  });

  it("creates a trip and opens it", async () => {
    const created = makeTrip({ _id: "9".repeat(24), name: "Chennai audit", status: "upcoming" });
    vi.mocked(api.post).mockResolvedValue({ trip: created });
    const user = userEvent.setup();
    render(<TripsPage />);
    await screen.findByText("Delhi offsite");

    await user.click(screen.getByRole("button", { name: /New trip/ }));
    await user.type(screen.getByLabelText(/Trip name/), "Chennai audit");
    fireEvent.change(screen.getByLabelText(/Start date/), { target: { value: "2026-12-10" } });
    await user.click(screen.getByRole("button", { name: "Create trip" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/api/trips",
        expect.objectContaining({
          name: "Chennai audit",
          startDate: "2026-12-10",
          endDate: "2026-12-10",
          travelers: [ME],
        })
      )
    );
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith(`/dashboard/trips/${"9".repeat(24)}`));
  });
});
