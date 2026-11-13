"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, Plane, X as XIcon } from "lucide-react";
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
import { TravelTypeIcon } from "@/components/trips/TravelTypeIcon";
import Button, { IconButton } from "@/components/ui/Button";
import Field, { selectClass } from "@/components/ui/Field";
import { Chip } from "@/components/ui/Badge";
import { cn } from "@/components/ui/cn";
import { linkClass } from "@/components/ui/styles";
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
function groupTripsForPicker<T extends TripOption>(
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
  const chipGroupRef = useRef<HTMLDivElement>(null);

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
    chipGroupRef.current?.querySelectorAll<HTMLButtonElement>("[role=radio]")[next]?.focus();
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {suggestion && (
        <div
          role="status"
          className="animate-fade-in flex flex-wrap items-center gap-x-3 gap-y-2 rounded-control border border-accent-line bg-tint py-2 pl-3 pr-2"
        >
          <Plane size={18} strokeWidth={1.75} className="shrink-0 text-accent" aria-hidden="true" />
          <p className="min-w-0 flex-1 basis-[200px] text-sm text-ink-2">
            Looks like this is part of <b className="font-semibold text-ink">{suggestion.name}</b>{" "}
            <span className="whitespace-nowrap">({formatTripDates(suggestion)})</span>. Add it?
          </p>
          <div className="flex items-center gap-1">
            <Button variant="secondary" size="sm" onClick={() => changeTrip(suggestion._id)}>
              Add to trip
            </Button>
            <IconButton
              icon={XIcon}
              size="sm"
              onClick={() => setDismissed((prev) => [...prev, suggestion._id])}
              aria-label="Dismiss trip suggestion"
            />
          </div>
        </div>
      )}

      <Field
        label="Business trip"
        optional
        hint={outsideHint}
        aside={
          <Link
            href="/dashboard/trips"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(linkClass, "inline-flex items-center gap-1")}
          >
            {trips.length > 0 ? "Manage trips" : "New trip"}
            <ExternalLink size={12} strokeWidth={1.75} aria-hidden="true" />
            <span className="sr-only">(opens in a new tab)</span>
          </Link>
        }
      >
        <select id="trip" disabled={disabled} value={trip} onChange={(e) => changeTrip(e.target.value)} className={selectClass}>
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
      </Field>

      {trip && (
        <div className="animate-fade-in flex flex-col gap-1">
          <p id="travelType-label" className="cap text-ink-3">
            Travel type<span className="font-normal normal-case tracking-normal">, optional</span>
          </p>
          <div ref={chipGroupRef} role="radiogroup" aria-labelledby="travelType-label" className="flex flex-wrap gap-2">
            {TRAVEL_TYPES.map((type, index) => {
              const checked = travelType === type;
              const tabbable = selectedIndex === -1 ? index === 0 : checked;
              return (
                <Chip
                  key={type}
                  role="radio"
                  pressed={checked}
                  tabIndex={tabbable ? 0 : -1}
                  disabled={disabled}
                  onClick={() => onTravelTypeChange(checked ? null : type)}
                  onKeyDown={(e) => handleChipKeyDown(e, index)}
                >
                  <TravelTypeIcon type={type} className={cn("h-[15px] w-[15px]", !checked && "text-ink-3")} />
                  {TRAVEL_TYPE_META[type].label}
                </Chip>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
