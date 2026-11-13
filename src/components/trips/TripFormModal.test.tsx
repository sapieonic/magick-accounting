import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TripFormModal from "./TripFormModal";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import type { TripListItem } from "@/types/trip";

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

const ME = "a".repeat(24);
const PRIYA = "b".repeat(24);
const DEPT = "c".repeat(24);
const TRIP_ID = "d".repeat(24);

const savedTrip = { _id: TRIP_ID, name: "Mumbai – Acme pitch" } as TripListItem;

const existingTrip: TripListItem = {
  _id: TRIP_ID,
  name: "Delhi offsite",
  destinations: ["Delhi"],
  startDate: "2026-11-10T00:00:00.000Z",
  endDate: "2026-11-12T00:00:00.000Z",
  travelers: [{ _id: ME, name: "Manas", email: "manas@example.com" }],
  status: "upcoming",
  purpose: "Team offsite",
  department: { _id: DEPT, name: "Engineering" },
  budget: 75000,
  notes: "",
  createdBy: { _id: ME, name: "Manas", email: "manas@example.com" },
  expenseCount: 0,
  totalAmount: 0,
  canManage: true,
};

/**
 * Types `text` into `field` as one paste: typing it key by key re-renders the
 * whole modal per character, which timed out under a loaded parallel run.
 */
async function fill(user: ReturnType<typeof userEvent.setup>, field: HTMLElement, text: string) {
  await user.click(field);
  await user.paste(text);
}

function renderModal(props: Partial<React.ComponentProps<typeof TripFormModal>> = {}) {
  const onSaved = vi.fn();
  const onClose = vi.fn();
  render(<TripFormModal isOpen onClose={onClose} onSaved={onSaved} {...props} />);
  return { onSaved, onClose };
}

describe("TripFormModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      user: { _id: ME, name: "Manas", email: "manas@example.com", role: "user" },
      isAdmin: false,
    } as any);
    vi.mocked(api.get).mockResolvedValue({
      members: [
        { _id: ME, name: "Manas", email: "manas@example.com" },
        { _id: PRIYA, name: "Priya", email: "priya@example.com" },
      ],
      departments: [{ _id: DEPT, name: "Engineering" }],
    });
    vi.mocked(api.post).mockResolvedValue({ trip: savedTrip });
    vi.mocked(api.put).mockResolvedValue({ trip: savedTrip });
  });

  it("creates a trip with the current user as the default traveler", async () => {
    const user = userEvent.setup();
    const { onSaved } = renderModal();

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/api/lookups?include=members,departments"));
    expect(screen.getByText("(you)")).toBeInTheDocument();

    await fill(user, screen.getByLabelText(/Trip name/), "Mumbai – Acme pitch");
    // A comma commits a place, and so does Enter.
    await fill(user, screen.getByLabelText("Destinations"), "Mumbai,");
    await user.paste("Pune");
    await user.keyboard("{Enter}");
    fireEvent.change(screen.getByLabelText(/Start date/), { target: { value: "2026-11-02" } });
    // End date follows the start date until changed.
    expect(screen.getByLabelText(/End date/)).toHaveValue("2026-11-02");
    fireEvent.change(screen.getByLabelText(/End date/), { target: { value: "2026-11-04" } });
    await fill(user, screen.getByLabelText("Purpose / client"), "Acme pitch");
    await fill(user, screen.getByLabelText("Budget (₹)"), "50000");

    await user.click(screen.getByRole("button", { name: "Travelers" }));
    await user.click(await screen.findByRole("option", { name: "Priya" }));

    await user.click(screen.getByRole("button", { name: "Create trip" }));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.post).toHaveBeenCalledWith("/api/trips", {
      name: "Mumbai – Acme pitch",
      purpose: "Acme pitch",
      destinations: ["Mumbai", "Pune"],
      startDate: "2026-11-02",
      endDate: "2026-11-04",
      travelers: [ME, PRIYA],
      department: null,
      budget: 50000,
      notes: "",
    });
    expect(onSaved).toHaveBeenCalledWith(savedTrip);
  });

  it("says people are loading, not that there are none, while the lookups load", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, isAdmin: false } as any);
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
    renderModal();

    const travelers = screen.getByRole("button", { name: "Travelers" });
    expect(travelers).toHaveTextContent("Loading people...");
    expect(travelers).not.toHaveTextContent("None available");
  });

  it("shows the validation message instead of posting", async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole("button", { name: "Create trip" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Trip name is required"));

    await user.type(screen.getByLabelText(/Trip name/), "Pune");
    fireEvent.change(screen.getByLabelText(/Start date/), { target: { value: "2026-11-05" } });
    fireEvent.change(screen.getByLabelText(/End date/), { target: { value: "2026-11-01" } });
    await user.click(screen.getByRole("button", { name: "Create trip" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("End date cannot be before the start date"));

    expect(api.post).not.toHaveBeenCalled();
  });

  it("shows server errors and keeps the form open", async () => {
    vi.mocked(api.post).mockRejectedValue(new Error("A traveler no longer exists"));
    const user = userEvent.setup();
    const { onSaved } = renderModal();

    await user.type(screen.getByLabelText(/Trip name/), "Pune");
    fireEvent.change(screen.getByLabelText(/Start date/), { target: { value: "2026-11-05" } });
    await user.click(screen.getByRole("button", { name: "Create trip" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("A traveler no longer exists"));
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("prefills an existing trip and saves it with PUT", async () => {
    const user = userEvent.setup();
    const { onSaved } = renderModal({ trip: existingTrip });

    expect(screen.getByRole("dialog", { name: "Edit trip" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Trip name/)).toHaveValue("Delhi offsite");
    expect(screen.getByLabelText(/Start date/)).toHaveValue("2026-11-10");
    expect(screen.getByLabelText(/End date/)).toHaveValue("2026-11-12");
    expect(screen.getByText("Delhi")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Department")).toHaveValue(DEPT));

    await user.clear(screen.getByLabelText(/Trip name/));
    await user.paste("Delhi offsite 2026");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(api.put).toHaveBeenCalledWith(
      `/api/trips/${TRIP_ID}`,
      expect.objectContaining({
        name: "Delhi offsite 2026",
        destinations: ["Delhi"],
        startDate: "2026-11-10",
        endDate: "2026-11-12",
        travelers: [ME],
        department: DEPT,
        budget: 75000,
        purpose: "Team offsite",
      })
    );
    expect(onSaved).toHaveBeenCalledWith(savedTrip);
  });
});
