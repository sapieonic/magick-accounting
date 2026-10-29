"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarDays, ChevronDown, FileWarning, MapPin, Plane, Plus, Users } from "lucide-react";
import { formatBaseCurrency } from "@/lib/currency";
import {
  formatTripDates,
  getTripStatus,
  totalsByTravelType,
  travelTypeLabel,
} from "@/lib/trip";
import { TRAVEL_TYPE_BAR_CLASSES } from "@/components/trips/TravelTypeIcon";
import { TravelerAvatars, TripStatusPill } from "@/components/trips/TripBadges";
import TripTimeline from "@/components/trips/TripTimeline";
import type { ExpenseListItem } from "@/types/expense";
import type { TripSummary } from "@/types/trip";

export interface TripClusterProps {
  trip: TripSummary;
  /** The trip's expenses on this page (those matching the active filters). */
  expenses: ExpenseListItem[];
  expanded: boolean;
  onToggle: () => void;
  onDelete?: (expense: ExpenseListItem) => void;
  onRemoveFromTrip?: (expense: ExpenseListItem) => void;
  /** Expense to open inside the timeline (deep links). */
  initialExpandedId?: string | null;
  /** Filters are active, so the trip may hold more expenses than shown. */
  filtered?: boolean;
}

export type ExpenseListEntry =
  | { kind: "expense"; key: string; expense: ExpenseListItem }
  | { kind: "trip"; key: string; trip: TripSummary; expenses: ExpenseListItem[] };

/** List key of a trip cluster; prefixed so it can't collide with an expense id. */
export function tripItemKey(tripId: string): string {
  return `trip:${tripId}`;
}

/**
 * Turns the flat `groupTrips` page into list rows: an expense whose trip is
 * in `trips` joins that trip's cluster (placed where its first expense is);
 * everything else, including expenses of a trip that no longer exists, is a
 * row of its own. Pass `null` for a flat list.
 */
export function buildExpenseListItems(
  expenses: ExpenseListItem[],
  trips: Record<string, TripSummary> | null
): ExpenseListEntry[] {
  const items: ExpenseListEntry[] = [];
  const clusters = new Map<string, Extract<ExpenseListEntry, { kind: "trip" }>>();
  for (const expense of expenses) {
    const tripId = expense.trip?._id;
    const trip = tripId && trips ? trips[tripId] : undefined;
    if (!trip) {
      items.push({ kind: "expense", key: expense._id, expense });
      continue;
    }
    let cluster = clusters.get(trip._id);
    if (!cluster) {
      cluster = { kind: "trip", key: tripItemKey(trip._id), trip, expenses: [] };
      clusters.set(trip._id, cluster);
      items.push(cluster);
    }
    cluster.expenses.push(expense);
  }
  return items;
}

const LEGEND_TYPES = 3;

/**
 * One expandable row standing in for a whole trip in the expenses list: the
 * trip at a glance (dates, status, travelers, total, spend mix) that opens
 * into a day-by-day timeline of its expenses.
 */
export default function TripCluster({
  trip,
  expenses,
  expanded,
  onToggle,
  onDelete,
  onRemoveFromTrip,
  initialExpandedId,
  filtered = false,
}: TripClusterProps) {
  // Totals come from the expenses on hand so optimistic deletes stay correct.
  const total = useMemo(
    () => Math.round(expenses.reduce((sum, e) => sum + (e.amountInBaseCurrency ?? e.amount ?? 0), 0) * 100) / 100,
    [expenses]
  );
  const byType = useMemo(() => totalsByTravelType(expenses).filter((row) => row.total > 0), [expenses]);
  const missingReceipts = expenses.filter((e) => !e.receiptKey).length;
  const status = getTripStatus(trip);
  const dates = formatTripDates(trip);
  const count = expenses.length;
  const countLabel = `${count} expense${count !== 1 ? "s" : ""}`;
  const legend = byType.slice(0, LEGEND_TYPES);
  const moreTypes = byType.length - legend.length;
  const tripHref = `/dashboard/trips/${trip._id}`;

  return (
    <div className={`relative ${expanded || count < 2 ? "" : "pb-1.5"}`}>
      {/* A second card peeking out underneath: "several expenses in here". */}
      {!expanded && count > 1 && (
        <div
          aria-hidden="true"
          className="absolute inset-x-3 bottom-0 h-6 rounded-b-xl border border-t-0 border-line bg-surface-muted shadow-sm"
        />
      )}

      <div
        className={`relative overflow-hidden rounded-xl border bg-surface shadow-sm transition-all duration-200 ${
          expanded
            ? "border-sky-200 shadow-md shadow-sky-500/5 dark:border-sky-500/40"
            : "border-line hover:border-line-strong hover:shadow-md"
        }`}
      >
        <div className="relative">
          {/* The whole header toggles; it sits under the content so the
              "Open trip" link can stay a real link (links can't nest in buttons). */}
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={`${trip.name}, ${dates}, ${countLabel}, ${formatBaseCurrency(total)}`}
            className="absolute inset-0 h-full w-full cursor-pointer transition-colors hover:bg-subtle/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
          />

          <div className="pointer-events-none relative px-4 py-4 sm:px-5">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-500 text-white shadow-sm shadow-sky-500/25">
                <Plane className="h-5 w-5" aria-hidden="true" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <p className="truncate text-sm font-semibold text-foreground">{trip.name}</p>
                  <span className="hidden sm:inline-flex">
                    <TripStatusPill status={status} />
                  </span>
                </div>
                <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                  <span className="truncate sm:flex-shrink-0">{dates}</span>
                  {trip.destinations.length > 0 && (
                    <>
                      <span className="hidden sm:inline" aria-hidden="true">&middot;</span>
                      <MapPin className="hidden h-3.5 w-3.5 flex-shrink-0 sm:inline" aria-hidden="true" />
                      <span className="hidden truncate sm:inline">{trip.destinations.join(", ")}</span>
                    </>
                  )}
                </div>
              </div>

              <div className="hidden sm:block">
                <TravelerAvatars travelers={trip.travelers} />
              </div>

              <div className="flex-shrink-0 text-right">
                <p className="text-sm font-bold tabular-nums text-foreground">{formatBaseCurrency(total)}</p>
                <p className="text-[11px] text-muted-foreground">{countLabel}</p>
              </div>

              <Link
                href={tripHref}
                className="pointer-events-auto relative hidden h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:flex"
                aria-label={`Open trip ${trip.name}`}
                title="Open trip"
              >
                <ArrowUpRight className="h-4 w-4" />
              </Link>

              <ChevronDown
                className={`h-5 w-5 flex-shrink-0 text-muted-foreground transition-transform duration-200 ${
                  expanded ? "rotate-180 text-sky-500" : ""
                }`}
                aria-hidden="true"
              />
            </div>

            {/* Spend mix by travel type (+ the status on phones, where the title row is tight) */}
            <div className={`mt-3 sm:pl-[60px] ${byType.length > 0 || missingReceipts > 0 ? "" : "sm:hidden"}`}>
              {byType.length > 0 && (
                <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
                  {byType.map((row) => (
                    <span
                      key={row.travelType ?? "none"}
                      className={`h-full min-w-[3px] ${TRAVEL_TYPE_BAR_CLASSES[row.travelType ?? "none"]}`}
                      style={{ flex: `${row.total} 1 0%` }}
                      title={`${travelTypeLabel(row.travelType)} · ${formatBaseCurrency(row.total)}`}
                    />
                  ))}
                </div>
              )}
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <span className="inline-flex sm:hidden">
                  <TripStatusPill status={status} />
                </span>
                {legend.length > 0 && <span className="sr-only">Spend by type:</span>}
                {legend.map((row) => (
                  <span key={row.travelType ?? "none"} className="inline-flex items-center gap-1">
                    <span
                      className={`h-2 w-2 rounded-full ${TRAVEL_TYPE_BAR_CLASSES[row.travelType ?? "none"]}`}
                      aria-hidden="true"
                    />
                    <span className="font-medium text-muted">{travelTypeLabel(row.travelType)}</span>
                    <span className="hidden tabular-nums sm:inline">{Math.round((row.total / total) * 100)}%</span>
                  </span>
                ))}
                {moreTypes > 0 && <span>+{moreTypes} more</span>}
                {missingReceipts > 0 && (
                  <span className="ml-auto inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-300">
                    <FileWarning className="h-3.5 w-3.5" aria-hidden="true" />
                    {missingReceipts} without receipt
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {expanded && (
          <div className="animate-slide-up border-t border-line bg-gradient-to-b from-subtle/80 to-surface px-3 py-4 sm:px-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="min-w-0 space-y-0.5 text-xs text-muted-foreground">
                {trip.travelers.length > 0 && (
                  <p className="flex min-w-0 items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                    <span className="truncate">{trip.travelers.map((t) => t.name).join(", ")}</span>
                  </p>
                )}
                {trip.destinations.length > 0 && (
                  <p className="flex min-w-0 items-center gap-1.5 sm:hidden">
                    <MapPin className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                    <span className="truncate">{trip.destinations.join(", ")}</span>
                  </p>
                )}
                {filtered && <p>Only expenses matching your filters are shown.</p>}
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                <Link href={`/dashboard/expenses/new?trip=${trip._id}`} className="btn-ghost px-3 py-1.5 text-xs">
                  <Plus className="h-3.5 w-3.5" /> Add expense
                </Link>
                <Link href={tripHref} className="btn-secondary px-3 py-1.5 text-xs">
                  Open trip <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>

            <TripTimeline
              trip={trip}
              expenses={expenses}
              onDelete={onDelete}
              onRemoveFromTrip={onRemoveFromTrip}
              initialExpandedId={initialExpandedId}
            />
          </div>
        )}
      </div>
    </div>
  );
}
