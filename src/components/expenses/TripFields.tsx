"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, Plane, X as XIcon } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import {
  TRAVEL_TYPES,
  TRAVEL_TYPE_META,
  dayKey,
  formatTripDates,
  getTripStatus,
  isWithinTrip,
  type TravelType,
  type TripStatus,
} from "@/lib/trip";
import { TRAVEL_TYPE_CHIP_CLASSES, TravelTypeIcon } from "@/components/trips/TravelTypeIcon";
import type { TripListItem } from "@/types/trip";

/** The parts of a `GET /api/trips` item the expense form uses. */
export type TripOption = Pick<TripListItem, "_id" | "name" | "startDate" | "endDate"> &
  Partial<Pick<TripListItem, "travelers" | "department" | "status">>;

/**
 * Loads the trips the caller can file expenses into, once, and again when the
 * window regains focus (so a trip created in another tab shows up without
 * losing the half-filled form).
 */
export function useTripOptions() {
  const [trips, setTrips] = useState<TripOption[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    const load = () =>
      api
        .get("/api/trips")
        .then((data) => {
          if (active) setTrips(Array.isArray(data?.trips) ? data.trips : []);
        })
        .catch(() => undefined)
        .finally(() => {
          if (active) setLoaded(true);
        });
    load();
    window.addEventListener("focus", load);
    return () => {
      active = false;
      window.removeEventListener("focus", load);
    };
  }, []);

  return { trips, loaded };
}

/**
 * The category a travel type fills in: one whose name matches
 * `TRAVEL_TYPE_META[type].categoryName` exactly (ignoring case), if any.
 */
export function categoryForTravelType<T extends { _id: string; name: string }>(
  type: TravelType | null,
  categories: T[]
): T | null {
  const name = type ? TRAVEL_TYPE_META[type].categoryName : null;
  if (!name) return null;
  return categories.find((c) => c.name.trim().toLowerCase() === name.toLowerCase()) ?? null;
}

const STATUS_ORDER: TripStatus[] = ["ongoing", "upcoming", "completed"];
const GROUP_LABELS: Record<TripStatus, string> = {
  ongoing: "Ongoing",
  upcoming: "Upcoming",
  completed: "Completed",
};

/**
 * Trips grouped for the picker: ongoing first, then upcoming (soonest first),
 * then completed (most recent first).
 */
export function groupTripsForPicker<T extends TripOption>(
  trips: T[],
  now: Date = new Date()
): { status: TripStatus; trips: T[] }[] {
  const groups: Record<TripStatus, T[]> = { ongoing: [], upcoming: [], completed: [] };
  for (const trip of trips) groups[getTripStatus(trip, now)].push(trip);
  const byStart = (a: T, b: T) => dayKey(a.startDate).localeCompare(dayKey(b.startDate));
  const byEnd = (a: T, b: T) => dayKey(a.endDate).localeCompare(dayKey(b.endDate));
  groups.ongoing.sort((a, b) => byStart(b, a));
  groups.upcoming.sort(byStart);
  groups.completed.sort((a, b) => byEnd(b, a) || byStart(b, a));
  return STATUS_ORDER.filter((status) => groups[status].length > 0).map((status) => ({
    status,
    trips: groups[status],
  }));
}

function travelerIds(trip: TripOption): string[] {
  return (trip.travelers ?? []).map((t) => (typeof t === "string" ? t : t._id));
}

/**
 * The trip an expense dated `day` most likely belongs to: one the user travels
 * on whose dates include that day. Overlaps go to the latest-starting trip.
 */
export function suggestTripForDate<T extends TripOption>(
  trips: T[],
  day: string,
  userId: string | null | undefined
): T | null {
  if (!userId || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  let best: T | null = null;
  for (const trip of trips) {
    if (!travelerIds(trip).includes(userId) || !isWithinTrip(day, trip)) continue;
    if (!best || dayKey(trip.startDate) > dayKey(best.startDate)) best = trip;
  }
  return best;
}

interface TripFieldsProps {
  /** Trips from `GET /api/trips` (see `useTripOptions`). */
  trips: TripOption[];
  /** Selected trip id, or "" for none. */
  trip: string;
  travelType: TravelType | null;
  onTripChange: (tripId: string) => void;
  onTravelTypeChange: (travelType: TravelType | null) => void;
  /** The expense date (yyyy-MM-dd), for the trip suggestion and the before/after hint. */
  date: string;
  /**
   * The expense's stored trip, so it still shows by name when it isn't in
   * `trips` (e.g. its owner was later removed from the travelers).
   */
  currentTrip?: { _id: string; name: string } | null;
  disabled?: boolean;
}

export default function TripFields({
  trips,
  trip,
  travelType,
  onTripChange,
  onTravelTypeChange,
  date,
  currentTrip,
  disabled = false,
}: TripFieldsProps) {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState<string[]>([]);
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const groups = useMemo(() => groupTripsForPicker(trips), [trips]);
  const selected = trips.find((t) => t._id === trip) ?? null;
  const fallbackName = !selected && trip ? (currentTrip?._id === trip ? currentTrip.name : "Selected trip") : null;

  const suggestion = useMemo(() => {
    if (trip || disabled) return null;
    const match = suggestTripForDate(trips, date, user?._id);
    return match && !dismissed.includes(match._id) ? match : null;
  }, [trip, disabled, trips, date, user?._id, dismissed]);

  const day = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
  const outsideHint =
    selected && day
      ? day < dayKey(selected.startDate)
        ? "Dated before the trip — it will show under “Before the trip”."
        : day > dayKey(selected.endDate)
          ? "Dated after the trip — it will show under “After the trip”."
          : null
      : null;

  const changeTrip = (next: string) => {
    // Taking an expense out of a trip shouldn't immediately re-suggest it.
    if (!next && trip) setDismissed((prev) => (prev.includes(trip) ? prev : [...prev, trip]));
    onTripChange(next);
    if (!next && travelType) onTravelTypeChange(null);
  };

  const selectedIndex = travelType ? TRAVEL_TYPES.indexOf(travelType) : -1;

  const handleChipKeyDown = (e: React.KeyboardEvent, index: number) => {
    const last = TRAVEL_TYPES.length - 1;
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = index === last ? 0 : index + 1;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = index === 0 ? last : index - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    if (next === null) return;
    e.preventDefault();
    onTravelTypeChange(TRAVEL_TYPES[next]);
    chipRefs.current[next]?.focus();
  };

  return (
    <div className="space-y-3">
      {suggestion && (
        <div
          role="status"
          className="animate-fade-in flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 dark:border-sky-500/30 dark:bg-sky-500/10"
        >
          <Plane className="h-5 w-5 shrink-0 text-sky-600 dark:text-sky-300" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-sm text-muted">
            Looks like this is part of <b className="font-semibold text-foreground">{suggestion.name}</b>{" "}
            <span className="whitespace-nowrap">({formatTripDates(suggestion)})</span>. Add it?
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => changeTrip(suggestion._id)}
              className="btn-secondary px-3 py-1.5 text-xs"
            >
              Add to trip
            </button>
            <button
              type="button"
              onClick={() => setDismissed((prev) => [...prev, suggestion._id])}
              aria-label="Dismiss trip suggestion"
              className="rounded p-1.5 text-muted-foreground hover:text-foreground"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <div>
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          <label htmlFor="trip" className="block text-sm font-medium text-muted">
            Business trip
            <span className="ml-1 text-xs font-normal text-muted-foreground">— optional</span>
          </label>
          <Link
            href="/dashboard/trips"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
          >
            {trips.length > 0 ? "Manage trips" : "New trip"}
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
            <span className="sr-only">(opens in a new tab)</span>
          </Link>
        </div>
        <select
          id="trip"
          disabled={disabled}
          value={trip}
          onChange={(e) => changeTrip(e.target.value)}
          aria-describedby={outsideHint ? "trip-hint" : undefined}
          className="input-field"
        >
          <option value="">Not part of a trip</option>
          {fallbackName && <option value={trip}>{fallbackName}</option>}
          {groups.map((group) => (
            <optgroup key={group.status} label={GROUP_LABELS[group.status]}>
              {group.trips.map((option) => (
                <option key={option._id} value={option._id}>
                  {option.name} · {formatTripDates(option)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {outsideHint && (
          <p id="trip-hint" className="mt-1 text-xs text-muted-foreground">
            {outsideHint}
          </p>
        )}
      </div>

      {trip && (
        <div className="animate-fade-in">
          <p id="travelType-label" className="mb-1.5 block text-sm font-medium text-muted">
            Travel type
            <span className="ml-1 text-xs font-normal text-muted-foreground">— optional</span>
          </p>
          <div role="radiogroup" aria-labelledby="travelType-label" className="flex flex-wrap gap-2">
            {TRAVEL_TYPES.map((type, index) => {
              const checked = travelType === type;
              const tabbable = selectedIndex === -1 ? index === 0 : checked;
              return (
                <button
                  key={type}
                  ref={(el) => {
                    chipRefs.current[index] = el;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  tabIndex={tabbable ? 0 : -1}
                  disabled={disabled}
                  onClick={() => onTravelTypeChange(checked ? null : type)}
                  onKeyDown={(e) => handleChipKeyDown(e, index)}
                  className={clsx(
                    "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50",
                    checked
                      ? clsx(TRAVEL_TYPE_CHIP_CLASSES[type], "border-transparent font-semibold shadow-sm")
                      : "border-line-strong bg-surface text-muted hover:bg-subtle hover:text-foreground"
                  )}
                >
                  <TravelTypeIcon type={type} className="h-3.5 w-3.5" />
                  {TRAVEL_TYPE_META[type].label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
