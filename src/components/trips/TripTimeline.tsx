"use client";

import { useEffect, useMemo, useState } from "react";
import { formatBaseCurrency } from "@/lib/currency";
import { groupByTripDay, type TripDates, type TripDaySection } from "@/lib/trip";
import ExpenseCard from "@/components/expenses/ExpenseCard";
import type { ExpenseListItem } from "@/types/expense";

export interface TripTimelineProps {
  trip: TripDates;
  /** The trip's expenses to show, any order; grouped into days here. */
  expenses: ExpenseListItem[];
  /** Deletes an expense (with the caller's undo flow); omitted hides Delete. */
  onDelete?: (expense: ExpenseListItem) => void;
  /** Takes an expense out of the trip; omitted hides the action. */
  onRemoveFromTrip?: (expense: ExpenseListItem) => void;
  /** Expense to open initially (deep links). */
  initialExpandedId?: string | null;
}

function SectionMarker({ kind }: { kind: TripDaySection<unknown>["kind"] }) {
  if (kind === "day") {
    return (
      <span className="absolute -left-[22px] top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-surface ring-2 ring-brand-500 dark:ring-brand-400">
        <span className="h-1.5 w-1.5 rounded-full bg-brand-500 dark:bg-brand-400" />
      </span>
    );
  }
  return (
    <span className="absolute -left-[22px] top-1 h-3.5 w-3.5 rounded-full border-2 border-dashed border-line-strong bg-surface" />
  );
}

/**
 * A trip's expenses laid out day by day, with "Before the trip" and "After
 * the trip" sections for bookings and stragglers. One expense opens at a time.
 */
export default function TripTimeline({
  trip,
  expenses,
  onDelete,
  onRemoveFromTrip,
  initialExpandedId = null,
}: TripTimelineProps) {
  const [expandedId, setExpandedId] = useState<string | null>(initialExpandedId);

  // A deep link can arrive after the first render (data loads later).
  useEffect(() => {
    if (initialExpandedId) setExpandedId(initialExpandedId);
  }, [initialExpandedId]);

  const sections = useMemo(() => groupByTripDay(expenses, trip), [expenses, trip]);

  if (sections.length === 0) {
    return (
      <div data-testid="trip-timeline" className="rounded-xl border border-dashed border-line-strong px-4 py-8 text-center text-sm text-muted-foreground">
        No expenses to show for this trip yet.
      </div>
    );
  }

  return (
    <ol data-testid="trip-timeline" className="relative space-y-5 pl-7" aria-label="Trip timeline">
      {/* The rail the day markers sit on */}
      <span aria-hidden="true" className="absolute bottom-3 left-[12.5px] top-2 w-px bg-line-strong/70" />
      {sections.map((section) => {
        const [primary, secondary] = section.label.split(" · ");
        return (
          <li key={section.key} className="relative" aria-label={section.label}>
            <SectionMarker kind={section.kind} />
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h4 className="flex min-w-0 items-baseline gap-2 text-sm">
                <span
                  className={`font-semibold ${section.kind === "day" ? "text-foreground" : "italic text-muted"}`}
                >
                  {primary}
                </span>
                {secondary && <span className="truncate text-xs font-medium text-muted-foreground">{secondary}</span>}
                <span className="hidden flex-shrink-0 text-xs text-muted-foreground sm:inline">
                  &middot; {section.items.length} expense{section.items.length !== 1 ? "s" : ""}
                </span>
              </h4>
              <span className="flex-shrink-0 text-xs font-semibold tabular-nums text-muted" title="Section total">
                {formatBaseCurrency(section.total)}
              </span>
            </div>
            <div className="space-y-2">
              {section.items.map((expense) => (
                <ExpenseCard
                  key={expense._id}
                  expense={expense}
                  variant="nested"
                  showDate={section.kind !== "day"}
                  expanded={expandedId === expense._id}
                  onToggle={() => setExpandedId((prev) => (prev === expense._id ? null : expense._id))}
                  onDelete={onDelete}
                  onRemoveFromTrip={onRemoveFromTrip}
                />
              ))}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
