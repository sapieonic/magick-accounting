"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronRight, FileWarning, Luggage, MapPin, Plus, Users } from "lucide-react";
import { formatBaseCurrency } from "@/lib/currency";
import { formatTripDates, getTripStatus } from "@/lib/trip";
import Button from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { focusRing, linkClass } from "@/components/ui/styles";
import { TripStatusBadge } from "@/components/trips/TripMeta";
import TripTimeline from "@/components/trips/TripTimeline";
import type { ExpenseActions } from "@/components/expenses/ledger/ExpenseDetail";
import { baseAmount } from "@/components/expenses/ledger/format";
import { ledgerPad } from "@/components/expenses/ledger/ExpenseRow";
import type { ExpenseListItem } from "@/types/expense";
import type { TripSummary } from "@/types/trip";

interface TripClusterProps extends ExpenseActions {
  trip: TripSummary;
  /** The trip's expenses on this page (those matching the active filters). */
  expenses: ExpenseListItem[];
  expanded: boolean;
  onToggle: () => void;
  /** The open expense (shared with the rest of the list). */
  selectedId: string | null;
  onSelect: (expense: ExpenseListItem | null) => void;
  /** Show the open expense under its row, else the page shows it in a side panel. */
  inlineDetail: boolean;
  detailId?: string;
  /** Filters are active, so the trip may hold more expenses than shown. */
  filtered?: boolean;
}

type ExpenseListEntry =
  | { kind: "expense"; key: string; expense: ExpenseListItem }
  | { kind: "trip"; key: string; trip: TripSummary; expenses: ExpenseListItem[] };

/** List key of a trip cluster; prefixed so it can't collide with an expense id. */
export function tripItemKey(tripId: string): string {
  return `trip:${tripId}`;
}

/**
 * The item an expense counts towards in the paginated list, the way the
 * server counts it: in the grouped list every expense of a trip is one item,
 * even when the trip can't be opened and its expenses show as plain rows.
 */
export function pageItemKey(expense: ExpenseListItem, grouped: boolean): string {
  const tripId = expense.trip?._id;
  return grouped && tripId ? tripItemKey(tripId) : expense._id;
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

/**
 * A whole trip as one band in the expenses ledger: dates, count, travellers
 * and total, opening into its expenses day by day.
 */
export default function TripCluster({
  trip,
  expenses,
  expanded,
  onToggle,
  selectedId,
  onSelect,
  inlineDetail,
  detailId,
  onDelete,
  onRemoveFromTrip,
  filtered = false,
}: TripClusterProps) {
  // Totals come from the expenses on hand so optimistic deletes stay correct.
  const total = useMemo(
    () => Math.round(expenses.reduce((sum, e) => sum + baseAmount(e), 0) * 100) / 100,
    [expenses]
  );
  const missingReceipts = expenses.filter((e) => !e.receiptKey).length;
  const dates = formatTripDates(trip);
  const count = expenses.length;
  const countLabel = `${count} expense${count !== 1 ? "s" : ""}`;
  const travellers = trip.travelers.map((t) => t.name).join(", ");

  return (
    <div>
      {/* Narrow: name and total, then the status line. Wide (container ≥ 620px): one line. */}
      <div
        className={cn(
          "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3.5 border-t border-rule-2 bg-gradient-to-r from-cat-tr-soft to-accent-soft py-1.5 [@container(min-width:620px)]:grid-cols-[minmax(0,1fr)_auto_auto]",
          ledgerPad()
        )}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={`${trip.name}, ${dates}, ${countLabel}, ${formatBaseCurrency(total)}`}
          className={cn("col-start-1 row-start-1 flex min-h-11 min-w-0 cursor-pointer items-center gap-2.5 rounded-control text-left", focusRing)}
        >
          <ChevronRight
            aria-hidden="true"
            size={14}
            strokeWidth={1.75}
            className={cn("shrink-0 text-ink-2 transition-transform duration-140", expanded && "rotate-90")}
          />
          <Luggage aria-hidden="true" size={18} strokeWidth={1.6} className="shrink-0 text-cat-tr" />
          <span className="flex min-w-0 flex-col">
            <span className="ell font-semibold text-ink">{trip.name}</span>
            <span className="flex min-w-0 gap-1.5 text-xs text-ink-2">
              <span className="shrink-0">{dates}</span>
              <span aria-hidden="true">·</span>
              <span className="shrink-0">{countLabel}</span>
              {/* Narrow bands have no room left for the names (they'd ellipsize
                  to nothing after a dangling "·"); the open band lists them. */}
              {travellers && (
                <span className="hidden min-w-0 gap-1.5 [@container(min-width:620px)]:flex">
                  <span aria-hidden="true">·</span>
                  <span className="ell">{travellers}</span>
                </span>
              )}
            </span>
          </span>
        </button>
        <span className="col-span-2 row-start-2 flex flex-wrap items-center gap-x-3 gap-y-1 pl-[38px] [@container(min-width:620px)]:col-span-1 [@container(min-width:620px)]:col-start-2 [@container(min-width:620px)]:row-start-1 [@container(min-width:620px)]:pl-0">
          <TripStatusBadge status={getTripStatus(trip)} />
          {missingReceipts > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber">
              <FileWarning aria-hidden="true" size={13} strokeWidth={1.75} />
              {missingReceipts} without receipt
            </span>
          )}
          <Link
            href={`/dashboard/trips/${trip._id}`}
            aria-label={`Open trip ${trip.name}`}
            className={cn(linkClass, "inline-flex min-h-11 items-center gap-1 text-[13px]")}
          >
            Open trip
            <ArrowUpRight aria-hidden="true" size={13} strokeWidth={1.75} />
          </Link>
        </span>
        <span className="num col-start-2 row-start-1 whitespace-nowrap text-right font-medium text-ink [@container(min-width:620px)]:col-start-3 [@container(min-width:620px)]:min-w-[104px]">
          {formatBaseCurrency(total)}
        </span>
      </div>

      {expanded && (
        <div className="animate-slide-up bg-background">
          <div className={cn("flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-1.5 text-xs text-ink-3", ledgerPad(true))}>
            <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-0.5">
              {trip.travelers.length > 0 && (
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <Users aria-hidden="true" size={13} strokeWidth={1.75} className="shrink-0" />
                  <span className="ell">{travellers}</span>
                </span>
              )}
              {trip.destinations.length > 0 && (
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <MapPin aria-hidden="true" size={13} strokeWidth={1.75} className="shrink-0" />
                  <span className="ell">{trip.destinations.join(", ")}</span>
                </span>
              )}
              {filtered && <span>Only expenses matching your filters are shown.</span>}
            </div>
            <Button variant="ghost" size="sm" icon={Plus} href={`/dashboard/expenses/new?trip=${trip._id}`}>
              Add expense
            </Button>
          </div>
          <TripTimeline
            trip={trip}
            expenses={expenses}
            nested
            selectedId={selectedId}
            onSelect={onSelect}
            inlineDetail={inlineDetail}
            detailId={detailId}
            onDelete={onDelete}
            onRemoveFromTrip={onRemoveFromTrip}
          />
        </div>
      )}
    </div>
  );
}
