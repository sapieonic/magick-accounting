import { describe, it, expect } from "vitest";
import {
  dayKey,
  formatTripDates,
  getTripStatus,
  withViewerStatus,
  groupByTripDay,
  isTravelType,
  isWithinTrip,
  normalizeTravelType,
  normalizeTripInput,
  totalsByTravelType,
  travelTypeLabel,
  tripDayCount,
  TRIP_LIMITS,
} from "@/lib/trip";

const TRAVELER = "507f1f77bcf86cd799439011";
const OTHER = "507f1f77bcf86cd799439012";
const DEPT = "507f191e810c19729de860ec";

const trip = { startDate: "2026-10-12T00:00:00.000Z", endDate: "2026-10-15T00:00:00.000Z" };

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    name: "  Goa offsite ",
    startDate: "2026-10-12",
    endDate: "2026-10-15",
    travelers: [TRAVELER],
    ...overrides,
  };
}

describe("travel types", () => {
  it("recognises the known types only", () => {
    expect(isTravelType("flight")).toBe(true);
    expect(isTravelType("client_meeting")).toBe(true);
    expect(isTravelType("Flight")).toBe(false);
    expect(isTravelType(null)).toBe(false);
  });

  it("labels a type, or 'Untagged' without one", () => {
    expect(travelTypeLabel("cab")).toBe("Cab / local");
    expect(travelTypeLabel(null)).toBe("Untagged");
  });

  it("normalizes absent values to null and rejects unknown ones", () => {
    expect(normalizeTravelType(undefined)).toBeNull();
    expect(normalizeTravelType("")).toBeNull();
    expect(normalizeTravelType("stay")).toBe("stay");
    expect(() => normalizeTravelType("yacht")).toThrow("Travel type is invalid");
  });
});

describe("normalizeTripInput", () => {
  it("trims text and stores dates at UTC midnight", () => {
    const input = normalizeTripInput(
      validInput({ startDate: "2026-10-12T18:30:00.000Z", purpose: " Sales kickoff " })
    );
    expect(input.name).toBe("Goa offsite");
    expect(input.purpose).toBe("Sales kickoff");
    expect(input.startDate.toISOString()).toBe("2026-10-12T00:00:00.000Z");
    expect(input.endDate.toISOString()).toBe("2026-10-15T00:00:00.000Z");
    expect(input).toEqual(
      expect.objectContaining({ department: null, budget: null, notes: "", destinations: [] })
    );
  });

  it("accepts stored Date values, as merged updates send them", () => {
    const input = normalizeTripInput(
      validInput({ startDate: new Date("2026-10-12T00:00:00.000Z"), endDate: new Date("2026-10-12T00:00:00.000Z") })
    );
    expect(input.endDate.toISOString()).toBe("2026-10-12T00:00:00.000Z");
  });

  it("requires a name and both dates", () => {
    expect(() => normalizeTripInput(validInput({ name: "   " }))).toThrow("Trip name is required");
    expect(() => normalizeTripInput(validInput({ startDate: undefined }))).toThrow("Start date is required");
    expect(() => normalizeTripInput(validInput({ endDate: "soon" }))).toThrow("End date is required");
  });

  it("rejects an end date before the start and over-long trips", () => {
    expect(() => normalizeTripInput(validInput({ endDate: "2026-10-11" }))).toThrow(
      "End date cannot be before the start date"
    );
    expect(() => normalizeTripInput(validInput({ startDate: "2026-01-01", endDate: "2027-01-02" }))).toThrow(
      `at most ${TRIP_LIMITS.days} days`
    );
  });

  it("dedupes destinations case-insensitively and accepts a comma list", () => {
    expect(normalizeTripInput(validInput({ destinations: "Goa, Pune , goa,," })).destinations).toEqual([
      "Goa",
      "Pune",
    ]);
    expect(() => normalizeTripInput(validInput({ destinations: { city: "Goa" } }))).toThrow(
      "Destinations must be a list"
    );
  });

  it("rejects days that don't exist instead of rolling them over", () => {
    expect(() => normalizeTripInput(validInput({ startDate: "2026-02-31" }))).toThrow("Start date is invalid");
    expect(() => normalizeTripInput(validInput({ endDate: "2026-13-01" }))).toThrow("End date is invalid");
    expect(() => normalizeTripInput(validInput({ startDate: "2026-10-12garbage" }))).toThrow("Start date is required");
    // Stored dates come back as full timestamps when an update is merged.
    expect(normalizeTripInput(validInput({ startDate: "2026-10-12T00:00:00.000Z" })).startDate.toISOString()).toBe(
      "2026-10-12T00:00:00.000Z"
    );
  });

  it("lowercases and dedupes travelers, and needs at least one valid id", () => {
    expect(normalizeTripInput(validInput({ travelers: [TRAVELER.toUpperCase(), TRAVELER, OTHER] })).travelers).toEqual([
      TRAVELER,
      OTHER,
    ]);
    expect(() => normalizeTripInput(validInput({ travelers: [] }))).toThrow("Add at least one traveler");
    expect(() => normalizeTripInput(validInput({ travelers: ["nope"] }))).toThrow("A traveler is invalid");
    expect(() => normalizeTripInput(validInput({ travelers: TRAVELER }))).toThrow("Travelers must be a list");
  });

  it("validates the department and budget", () => {
    const input = normalizeTripInput(validInput({ department: DEPT, budget: "12500.555" }));
    expect(input.department).toBe(DEPT);
    expect(input.budget).toBe(12500.56);
    expect(normalizeTripInput(validInput({ department: "", budget: "" }))).toEqual(
      expect.objectContaining({ department: null, budget: null })
    );
    expect(() => normalizeTripInput(validInput({ department: "x" }))).toThrow("Department is invalid");
    expect(() => normalizeTripInput(validInput({ budget: -1 }))).toThrow("Budget must be a valid non-negative number");
    expect(() => normalizeTripInput(validInput({ budget: true }))).toThrow("Budget must be a valid non-negative number");
  });

  it("limits text lengths", () => {
    expect(() => normalizeTripInput(validInput({ notes: "x".repeat(TRIP_LIMITS.notes + 1) }))).toThrow(
      `Notes must be at most ${TRIP_LIMITS.notes} characters`
    );
    expect(() => normalizeTripInput(validInput({ name: 42 }))).toThrow("Trip name must be text");
  });
});

describe("trip dates", () => {
  it("derives the status from the viewer's local day", () => {
    expect(getTripStatus(trip, new Date(2026, 9, 11, 23, 59))).toBe("upcoming");
    expect(getTripStatus(trip, new Date(2026, 9, 12, 0, 1))).toBe("ongoing");
    expect(getTripStatus(trip, new Date(2026, 9, 15, 23, 0))).toBe("ongoing");
    expect(getTripStatus(trip, new Date(2026, 9, 16, 0, 1))).toBe("completed");
  });
  it("re-derives a served status for the viewer's day", () => {
    const served = { startDate: "2026-10-12T00:00:00.000Z", endDate: "2026-10-15T00:00:00.000Z", status: "upcoming" as const };
    expect(withViewerStatus(served, new Date(2026, 9, 12, 0, 1)).status).toBe("ongoing");
  });


  it("counts days inclusively and checks membership by day", () => {
    expect(tripDayCount(trip)).toBe(4);
    expect(isWithinTrip("2026-10-12", trip)).toBe(true);
    expect(isWithinTrip("2026-10-16", trip)).toBe(false);
    expect(dayKey(new Date("2026-10-13T00:00:00.000Z"))).toBe("2026-10-13");
  });

  it("formats ranges compactly", () => {
    expect(formatTripDates(trip)).toBe("12 – 15 Oct 2026");
    expect(formatTripDates({ startDate: "2026-09-28", endDate: "2026-10-02" })).toBe("28 Sep – 2 Oct 2026");
    expect(formatTripDates({ startDate: "2026-12-30", endDate: "2027-01-03" })).toBe(
      "30 Dec 2026 – 3 Jan 2027"
    );
    expect(formatTripDates({ startDate: "2026-10-12", endDate: "2026-10-12" })).toBe("12 Oct 2026");
  });
});

describe("groupByTripDay", () => {
  const item = (id: string, date: string, amount: number, amountInBaseCurrency?: number) => ({
    id,
    date: `${date}T00:00:00.000Z`,
    amount,
    amountInBaseCurrency,
  });

  it("puts bookings before and after the trip in their own sections", () => {
    const sections = groupByTripDay(
      [
        item("hotel", "2026-10-13", 5000),
        item("late-cab", "2026-10-18", 300),
        item("flight", "2026-09-01", 100, 8300),
        item("dinner", "2026-10-13", 1200.105),
        item("visa", "2026-08-20", 2000),
        item("arrival-cab", "2026-10-12", 450),
      ],
      trip
    );

    expect(sections.map((section) => section.key)).toEqual(["pre", "2026-10-12", "2026-10-13", "post"]);
    expect(sections[0]).toEqual(
      expect.objectContaining({ kind: "pre", label: "Before the trip", total: 10300 })
    );
    expect(sections[0].items.map((entry) => entry.id)).toEqual(["visa", "flight"]);
    expect(sections[1]).toEqual(
      expect.objectContaining({ kind: "day", dayNumber: 1, label: "Day 1 · Mon, 12 Oct" })
    );
    expect(sections[2].dayNumber).toBe(2);
    // Same-day items keep their input order.
    expect(sections[2].items.map((entry) => entry.id)).toEqual(["hotel", "dinner"]);
    expect(sections[2].total).toBe(6200.11);
    expect(sections[3]).toEqual(expect.objectContaining({ kind: "post", label: "After the trip", total: 300 }));
  });

  it("returns no sections for no expenses", () => {
    expect(groupByTripDay([], trip)).toEqual([]);
  });
});

describe("totalsByTravelType", () => {
  it("sums base amounts per type, largest first, untagged last", () => {
    const rows = totalsByTravelType([
      { date: "2026-10-12", amount: 100, amountInBaseCurrency: 8300, travelType: "flight" },
      { date: "2026-10-12", amount: 9000, travelType: null },
      { date: "2026-10-13", amount: 300, travelType: "cab" },
      { date: "2026-10-14", amount: 450.255, travelType: "cab" },
      { date: "2026-10-14", amount: 50 },
    ]);

    expect(rows).toEqual([
      { travelType: "flight", total: 8300, count: 1 },
      { travelType: "cab", total: 750.26, count: 2 },
      { travelType: null, total: 9050, count: 2 },
    ]);
  });
});
