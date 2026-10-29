import { format, parseISO, differenceInCalendarDays } from "date-fns";

// Kept here (not in the model) so client code can import it without mongoose.
export type TravelType =
  | "flight"
  | "train"
  | "bus"
  | "cab"
  | "stay"
  | "food"
  | "client_meeting"
  | "visa"
  | "other";

export const TRAVEL_TYPES: TravelType[] = [
  "flight",
  "train",
  "bus",
  "cab",
  "stay",
  "food",
  "client_meeting",
  "visa",
  "other",
];

/**
 * `categoryName` is the accounting category a travel type fills in on the
 * expense form, so travelers don't tag the same thing twice. It only applies
 * when a category with that exact name exists.
 */
export const TRAVEL_TYPE_META: Record<TravelType, { label: string; categoryName: string | null }> = {
  flight: { label: "Flight", categoryName: "Travel" },
  train: { label: "Train", categoryName: "Travel" },
  bus: { label: "Bus", categoryName: "Travel" },
  cab: { label: "Cab / local", categoryName: "Travel" },
  stay: { label: "Stay", categoryName: "Travel" },
  food: { label: "Food & drinks", categoryName: "Meals & Entertainment" },
  client_meeting: { label: "Client meeting", categoryName: "Meals & Entertainment" },
  visa: { label: "Visa & fees", categoryName: "Travel" },
  other: { label: "Other", categoryName: null },
};

export function isTravelType(value: unknown): value is TravelType {
  return typeof value === "string" && (TRAVEL_TYPES as string[]).includes(value);
}

export function travelTypeLabel(type: TravelType | null | undefined): string {
  return type ? TRAVEL_TYPE_META[type].label : "Untagged";
}

/**
 * Validates a travel type sent by a form or the AI extractor. Returns `null`
 * when absent. Throws with a user-facing message when present but unknown.
 */
export function normalizeTravelType(raw: unknown): TravelType | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (!isTravelType(raw)) throw new Error("Travel type is invalid");
  return raw;
}

export type TripStatus = "upcoming" | "ongoing" | "completed";

export const TRIP_STATUS_LABELS: Record<TripStatus, string> = {
  upcoming: "Upcoming",
  ongoing: "Ongoing",
  completed: "Completed",
};

/**
 * The calendar day (yyyy-MM-dd) a stored date belongs to. Expense and trip
 * dates are stored at UTC midnight of the day the user picked, so the UTC
 * date part is that day whatever the viewer's time zone.
 */
export function dayKey(value: string | Date): string {
  const iso = typeof value === "string" ? value : value.toISOString();
  return iso.slice(0, 10);
}

/**
 * Today's calendar day in the runtime's time zone: the viewer's in the
 * browser, the server's on the server.
 */
export function todayKey(now: Date = new Date()): string {
  return format(now, "yyyy-MM-dd");
}

export interface TripDates {
  startDate: string | Date;
  endDate: string | Date;
}

/** Derived from the dates, never stored, so it can't go stale. */
export function getTripStatus(trip: TripDates, now: Date = new Date()): TripStatus {
  const today = todayKey(now);
  if (today < dayKey(trip.startDate)) return "upcoming";
  if (today > dayKey(trip.endDate)) return "completed";
  return "ongoing";
}

/**
 * Re-derives a trip's status for the viewer's own day. The API derives it in
 * the server's time zone, which differs from the viewer's around midnight.
 */
export function withViewerStatus<T extends TripDates & { status: TripStatus }>(
  trip: T,
  now: Date = new Date()
): T {
  return { ...trip, status: getTripStatus(trip, now) };
}

/** Whether a yyyy-MM-dd day falls inside the trip, inclusive. */
export function isWithinTrip(day: string, trip: TripDates): boolean {
  return day >= dayKey(trip.startDate) && day <= dayKey(trip.endDate);
}

export function tripDayCount(trip: TripDates): number {
  return (
    differenceInCalendarDays(parseISO(dayKey(trip.endDate)), parseISO(dayKey(trip.startDate))) + 1
  );
}

/** "12 – 15 Oct 2026", "28 Sep – 2 Oct 2026", "30 Dec 2026 – 3 Jan 2027", or one day. */
export function formatTripDates(trip: TripDates): string {
  const start = parseISO(dayKey(trip.startDate));
  const end = parseISO(dayKey(trip.endDate));
  if (dayKey(trip.startDate) === dayKey(trip.endDate)) return format(start, "d MMM yyyy");
  if (start.getFullYear() !== end.getFullYear()) {
    return `${format(start, "d MMM yyyy")} – ${format(end, "d MMM yyyy")}`;
  }
  if (start.getMonth() !== end.getMonth()) {
    return `${format(start, "d MMM")} – ${format(end, "d MMM yyyy")}`;
  }
  return `${format(start, "d")} – ${format(end, "d MMM yyyy")}`;
}

export interface TripDaySection<T> {
  key: string;
  /** "Before the trip", "Day 2 · Tue, 13 Oct", "After the trip". */
  label: string;
  kind: "pre" | "day" | "post";
  /** 1-based day of the trip; only for `day` sections. */
  dayNumber?: number;
  items: T[];
  /** Base-currency total of `items`. */
  total: number;
}

interface DatedAmount {
  date: string;
  amount: number;
  amountInBaseCurrency?: number | null;
}

function baseAmount(item: DatedAmount): number {
  return item.amountInBaseCurrency ?? item.amount ?? 0;
}

/**
 * Groups a trip's expenses into a day-by-day timeline. Bookings made before
 * the trip (a flight booked weeks early) and stragglers after it get their
 * own sections instead of being rejected. Only days with expenses appear.
 */
export function groupByTripDay<T extends DatedAmount>(items: T[], trip: TripDates): TripDaySection<T>[] {
  const start = dayKey(trip.startDate);
  const end = dayKey(trip.endDate);
  const startDay = parseISO(start);
  const sorted = items
    .map((item, index) => ({ item, index, day: dayKey(item.date) }))
    .sort((a, b) => (a.day === b.day ? a.index - b.index : a.day < b.day ? -1 : 1));

  const sections: TripDaySection<T>[] = [];
  const byKey = new Map<string, TripDaySection<T>>();
  for (const { item, day } of sorted) {
    let key: string;
    let section: Omit<TripDaySection<T>, "items" | "total">;
    if (day < start) {
      key = "pre";
      section = { key, label: "Before the trip", kind: "pre" };
    } else if (day > end) {
      key = "post";
      section = { key, label: "After the trip", kind: "post" };
    } else {
      key = day;
      const date = parseISO(day);
      const dayNumber = differenceInCalendarDays(date, startDay) + 1;
      section = { key, label: `Day ${dayNumber} · ${format(date, "EEE, d MMM")}`, kind: "day", dayNumber };
    }
    let existing = byKey.get(key);
    if (!existing) {
      existing = { ...section, items: [], total: 0 };
      byKey.set(key, existing);
      sections.push(existing);
    }
    existing.items.push(item);
    existing.total = Math.round((existing.total + baseAmount(item)) * 100) / 100;
  }
  return sections;
}

export interface TravelTypeTotal {
  travelType: TravelType | null;
  total: number;
  count: number;
}

/** Base-currency spend per travel type, largest first; untagged last. */
export function totalsByTravelType(
  items: (DatedAmount & { travelType?: TravelType | null })[]
): TravelTypeTotal[] {
  const totals = new Map<TravelType | null, TravelTypeTotal>();
  for (const item of items) {
    const type = item.travelType ?? null;
    const row = totals.get(type) ?? { travelType: type, total: 0, count: 0 };
    row.total = Math.round((row.total + baseAmount(item)) * 100) / 100;
    row.count += 1;
    totals.set(type, row);
  }
  return [...totals.values()].sort((a, b) => {
    if (a.travelType === null) return 1;
    if (b.travelType === null) return -1;
    return b.total - a.total;
  });
}

// ---------------------------------------------------------------------------
// Trip input validation, shared by the API and the trip form.

const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}/;

export const TRIP_LIMITS = {
  name: 120,
  purpose: 300,
  notes: 2000,
  destinations: 10,
  destination: 80,
  travelers: 50,
  days: 366,
} as const;

export interface TripInput {
  name: string;
  purpose: string;
  destinations: string[];
  /** UTC midnight of the first day. */
  startDate: Date;
  /** UTC midnight of the last day. */
  endDate: Date;
  /** Lowercased user ids, deduplicated. */
  travelers: string[];
  department: string | null;
  /** In base currency. */
  budget: number | null;
  notes: string;
}

function text(raw: unknown, field: string, max: number): string {
  if (raw === null || raw === undefined) return "";
  if (typeof raw !== "string") throw new Error(`${field} must be text`);
  const value = raw.trim();
  if (value.length > max) throw new Error(`${field} must be at most ${max} characters`);
  return value;
}

function tripDate(raw: unknown, field: string): Date {
  const value = raw instanceof Date ? raw.toISOString() : raw;
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    throw new Error(`${field} is required`);
  }
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  // Date rolls impossible days over (Feb 31 → Mar 3); reject them instead.
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value.slice(0, 10)) {
    throw new Error(`${field} is invalid`);
  }
  return date;
}

/**
 * Validates a whole trip. Updates merge the stored trip with the changed
 * fields first, so the same rules always hold. Throws with a user-facing
 * message on the first problem.
 */
export function normalizeTripInput(body: Record<string, unknown>): TripInput {
  const name = text(body.name, "Trip name", TRIP_LIMITS.name);
  if (!name) throw new Error("Trip name is required");

  const startDate = tripDate(body.startDate, "Start date");
  const endDate = tripDate(body.endDate, "End date");
  if (endDate < startDate) throw new Error("End date cannot be before the start date");
  if (tripDayCount({ startDate, endDate }) > TRIP_LIMITS.days) {
    throw new Error(`A trip can be at most ${TRIP_LIMITS.days} days long`);
  }

  const rawDestinations =
    typeof body.destinations === "string" ? body.destinations.split(",") : body.destinations ?? [];
  if (!Array.isArray(rawDestinations)) throw new Error("Destinations must be a list");
  const destinations: string[] = [];
  for (const raw of rawDestinations) {
    const value = text(raw, "Each destination", TRIP_LIMITS.destination);
    if (value && !destinations.some((d) => d.toLowerCase() === value.toLowerCase())) {
      destinations.push(value);
    }
  }
  if (destinations.length > TRIP_LIMITS.destinations) {
    throw new Error(`A trip can have at most ${TRIP_LIMITS.destinations} destinations`);
  }

  const rawTravelers = body.travelers ?? [];
  if (!Array.isArray(rawTravelers)) throw new Error("Travelers must be a list");
  const travelers = [
    ...new Set(rawTravelers.map((id) => (typeof id === "string" ? id.trim().toLowerCase() : ""))),
  ];
  if (travelers.some((id) => !OBJECT_ID_PATTERN.test(id))) throw new Error("A traveler is invalid");
  if (travelers.length === 0) throw new Error("Add at least one traveler");
  if (travelers.length > TRIP_LIMITS.travelers) {
    throw new Error(`A trip can have at most ${TRIP_LIMITS.travelers} travelers`);
  }

  let department: string | null = null;
  if (body.department !== null && body.department !== undefined && body.department !== "") {
    department = String(body.department).trim().toLowerCase();
    if (!OBJECT_ID_PATTERN.test(department)) throw new Error("Department is invalid");
  }

  let budget: number | null = null;
  if (body.budget !== null && body.budget !== undefined && String(body.budget).trim() !== "") {
    budget = Number(body.budget);
    if (!Number.isFinite(budget) || budget < 0) {
      throw new Error("Budget must be a valid non-negative number");
    }
    budget = Math.round(budget * 100) / 100;
  }

  return {
    name,
    purpose: text(body.purpose, "Purpose", TRIP_LIMITS.purpose),
    destinations,
    startDate,
    endDate,
    travelers,
    department,
    budget,
    notes: text(body.notes, "Notes", TRIP_LIMITS.notes),
  };
}
