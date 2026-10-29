"use client";

// STUB — replaced by the list/timeline implementation. The props are the contract.
import type { ExpenseListItem } from "@/types/expense";
import type { TripDates } from "@/lib/trip";

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

export default function TripTimeline(props: TripTimelineProps) {
  return <div data-testid="trip-timeline">{props.expenses.length} expenses</div>;
}
