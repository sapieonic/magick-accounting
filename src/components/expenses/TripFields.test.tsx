import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addDays, format } from "date-fns";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/contexts/AuthContext";
import type { TravelType } from "@/lib/trip";
import TripFields, {
  categoryForTravelType,
  suggestTripForDate,
  type TripOption,
} from "./TripFields";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn() },
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const ME = { _id: "66c1884c0853f8a76a4da201", name: "Asha", email: "asha@example.com" };
const OTHER = { _id: "66c1884c0853f8a76a4da202", name: "Ravi", email: "ravi@example.com" };

/** yyyy-MM-dd `offset` days from today. */
function day(offset: number) {
  return format(addDays(new Date(), offset), "yyyy-MM-dd");
}

function trip(id: string, name: string, start: number, end: number, travelers = [ME]): TripOption {
  return {
    _id: id,
    name,
    startDate: `${day(start)}T00:00:00.000Z`,
    endDate: `${day(end)}T00:00:00.000Z`,
    travelers,
    department: null,
  };
}

const ONGOING = trip("trip-ongoing", "Mumbai client visit", -1, 2);
const UPCOMING_SOON = trip("trip-soon", "Pune offsite", 10, 12);
const UPCOMING_LATER = trip("trip-later", "Delhi expo", 40, 42);
const COMPLETED_OLD = trip("trip-old", "Goa retreat", -90, -85);
const COMPLETED_RECENT = trip("trip-recent", "Chennai audit", -20, -18);

let latest: { trip: string; travelType: TravelType | null } = { trip: "", travelType: null };

function Harness({
  trips,
  date = day(0),
  initialTrip = "",
  initialType = null,
  currentTrip,
}: {
  trips: TripOption[];
  date?: string;
  initialTrip?: string;
  initialType?: TravelType | null;
  currentTrip?: { _id: string; name: string } | null;
}) {
  const [tripId, setTripId] = useState(initialTrip);
  const [travelType, setTravelType] = useState<TravelType | null>(initialType);
  latest = { trip: tripId, travelType };
  return (
    <TripFields
      trips={trips}
      trip={tripId}
      travelType={travelType}
      onTripChange={setTripId}
      onTravelTypeChange={setTravelType}
      date={date}
      currentTrip={currentTrip}
    />
  );
}

describe("TripFields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ user: ME } as any);
  });

  it("lists ongoing, then upcoming (soonest first), then completed (latest first)", () => {
    render(
      <Harness
        trips={[COMPLETED_OLD, UPCOMING_LATER, ONGOING, COMPLETED_RECENT, UPCOMING_SOON]}
        date={day(-200)}
      />
    );
    const select = screen.getByLabelText(/business trip/i);
    const options = within(select).getAllByRole("option").map((o) => o.textContent);

    expect(options[0]).toBe("Not part of a trip");
    expect(options.slice(1).map((text) => text?.split(" · ")[0])).toEqual([
      "Mumbai client visit",
      "Pune offsite",
      "Delhi expo",
      "Chennai audit",
      "Goa retreat",
    ]);
    expect(options[1]).toMatch(/ · \d/);
    expect(within(select).getAllByRole("group").map((g) => g.getAttribute("label"))).toEqual([
      "Ongoing",
      "Upcoming",
      "Completed",
    ]);
  });

  it("shows travel-type chips only once a trip is picked", async () => {
    const user = userEvent.setup();
    render(<Harness trips={[ONGOING]} date={day(-200)} />);
    expect(screen.queryByRole("radiogroup", { name: /travel type/i })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/business trip/i), ONGOING._id);
    const group = screen.getByRole("radiogroup", { name: /travel type/i });
    expect(within(group).getAllByRole("radio")).toHaveLength(9);
    expect(within(group).getByRole("radio", { name: "Cab / local" })).toBeInTheDocument();
  });

  it("selects a chip, and clicking it again clears it", async () => {
    const user = userEvent.setup();
    render(<Harness trips={[ONGOING]} initialTrip={ONGOING._id} />);

    const flight = screen.getByRole("radio", { name: "Flight" });
    expect(flight).toHaveAttribute("aria-checked", "false");
    await user.click(flight);
    expect(flight).toHaveAttribute("aria-checked", "true");
    expect(latest.travelType).toBe("flight");

    await user.click(flight);
    expect(flight).toHaveAttribute("aria-checked", "false");
    expect(latest.travelType).toBeNull();
  });

  it("moves the selection with arrow keys and keeps one chip in the tab order", async () => {
    const user = userEvent.setup();
    render(<Harness trips={[ONGOING]} initialTrip={ONGOING._id} initialType="stay" />);

    const radios = screen.getAllByRole("radio");
    expect(radios.filter((r) => r.tabIndex === 0)).toEqual([screen.getByRole("radio", { name: "Stay" })]);

    screen.getByRole("radio", { name: "Stay" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(latest.travelType).toBe("food");
    expect(screen.getByRole("radio", { name: "Food & drinks" })).toHaveFocus();

    await user.keyboard("{Home}");
    expect(latest.travelType).toBe("flight");
    await user.keyboard("{ArrowLeft}");
    expect(latest.travelType).toBe("other");
  });

  it("clears the travel type when the trip is cleared", async () => {
    const user = userEvent.setup();
    render(<Harness trips={[ONGOING]} initialTrip={ONGOING._id} initialType="cab" />);

    await user.selectOptions(screen.getByLabelText(/business trip/i), "");
    expect(latest).toEqual({ trip: "", travelType: null });
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });

  it("suggests the trip the expense date falls in, and adds it on click", async () => {
    const user = userEvent.setup();
    render(<Harness trips={[ONGOING, UPCOMING_SOON]} />);

    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent(/looks like this is part of mumbai client visit/i);
    await user.click(within(banner).getByRole("button", { name: /add to trip/i }));

    expect(latest.trip).toBe(ONGOING._id);
    expect(screen.getByLabelText(/business trip/i)).toHaveValue(ONGOING._id);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("can dismiss the suggestion", async () => {
    const user = userEvent.setup();
    render(<Harness trips={[ONGOING]} />);

    await user.click(screen.getByRole("button", { name: /dismiss trip suggestion/i }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(latest.trip).toBe("");
  });

  it("doesn't re-suggest a trip the expense was just taken out of", async () => {
    const user = userEvent.setup();
    render(<Harness trips={[ONGOING]} initialTrip={ONGOING._id} />);

    await user.selectOptions(screen.getByLabelText(/business trip/i), "");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("only suggests trips the current user travels on", () => {
    render(<Harness trips={[trip("trip-x", "Ravi's trip", -1, 1, [OTHER])]} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("still shows a stored trip missing from the list by name", () => {
    render(
      <Harness
        trips={[ONGOING]}
        initialTrip="trip-gone"
        currentTrip={{ _id: "trip-gone", name: "Bengaluru summit" }}
      />
    );
    const select = screen.getByLabelText(/business trip/i) as HTMLSelectElement;
    expect(select).toHaveValue("trip-gone");
    expect(select.selectedOptions[0]).toHaveTextContent("Bengaluru summit");
  });

  it("notes when the expense is dated outside the selected trip", () => {
    render(<Harness trips={[UPCOMING_SOON]} initialTrip={UPCOMING_SOON._id} date={day(0)} />);
    expect(screen.getByLabelText(/business trip/i)).toHaveAccessibleDescription(
      /dated before the trip/i
    );
  });
});

describe("suggestTripForDate", () => {
  it("picks the latest-starting trip when several overlap", () => {
    const long = trip("trip-long", "Quarter on site", -30, 30);
    expect(suggestTripForDate([ONGOING, long], day(0), ME._id)?._id).toBe(ONGOING._id);
    expect(suggestTripForDate([ONGOING, long], day(-10), ME._id)?._id).toBe(long._id);
  });

  it("needs a user and a valid date", () => {
    expect(suggestTripForDate([ONGOING], day(0), undefined)).toBeNull();
    expect(suggestTripForDate([ONGOING], "", ME._id)).toBeNull();
  });
});

describe("categoryForTravelType", () => {
  const categories = [
    { _id: "c-travel", name: "travel" },
    { _id: "c-meals", name: "Meals & Entertainment" },
  ];

  it("matches the mapped category name ignoring case", () => {
    expect(categoryForTravelType("flight", categories)?._id).toBe("c-travel");
    expect(categoryForTravelType("food", categories)?._id).toBe("c-meals");
  });

  it("returns null for unmapped types or missing categories", () => {
    expect(categoryForTravelType("other", categories)).toBeNull();
    expect(categoryForTravelType(null, categories)).toBeNull();
    expect(categoryForTravelType("flight", [{ _id: "x", name: "Travel expenses" }])).toBeNull();
  });
});
