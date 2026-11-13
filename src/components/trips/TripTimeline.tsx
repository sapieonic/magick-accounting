"use client";

import { useEffect, useMemo, useState } from "react";
import { formatBaseCurrency } from "@/lib/currency";
import { groupByTripDay, type TripDates } from "@/lib/trip";
import { cn } from "@/components/ui/cn";
import ExpenseRow, { LEDGER_CONTAINER } from "@/components/expenses/ledger/ExpenseRow";
import type { ExpenseActions } from "@/components/expenses/ledger/ExpenseDetail";
import { expenseEditHref } from "@/components/expenses/ledger/format";
import type { ExpenseListItem } from "@/types/expense";

export interface TripTimelineProps extends ExpenseActions {
  trip: TripDates;
  /** The trip's expenses to show, any order; grouped into days here. */
  expenses: ExpenseListItem[];
  /** Expense to open initially (deep links). Uncontrolled use only. */
  initialExpandedId?: string | null;
  /** Where an expense's Edit form returns to (e.g. this trip's page). */
  returnTo?: string;
  /** Controlled selection (e.g. the expenses page's side panel); omit to manage it here. */
  selectedId?: string | null;
  onSelect?: (expense: ExpenseListItem | null) => void;
  /** Show the open expense's detail under its row (default), or leave it to the caller. */
  inlineDetail?: boolean;
  /** Id of the caller's detail panel, for aria-controls when not inline. */
  detailId?: string;
  /** Rows sit inside a trip band on the expenses list. */
  nested?: boolean;
}

/**
 * A trip's expenses day by day, with "Before the trip" and "After the trip"
 * sections for bookings and stragglers, each with its total. One expense
 * is open at a time.
 */
export default function TripTimeline({
  trip,
  expenses,
  onDelete,
  onRemoveFromTrip,
  initialExpandedId = null,
  returnTo,
  selectedId,
  onSelect,
  inlineDetail = true,
  detailId,
  nested = false,
}: TripTimelineProps) {
  const [ownSelectedId, setOwnSelectedId] = useState<string | null>(initialExpandedId);
  const controlled = onSelect !== undefined;
  const openId = controlled ? selectedId ?? null : ownSelectedId;

  // A deep link can arrive after the first render (data loads later).
  useEffect(() => {
    if (initialExpandedId) setOwnSelectedId(initialExpandedId);
  }, [initialExpandedId]);

  const sections = useMemo(() => groupByTripDay(expenses, trip), [expenses, trip]);

  const toggle = (expense: ExpenseListItem) => {
    const next = openId === expense._id ? null : expense;
    if (controlled) onSelect(next);
    else setOwnSelectedId(next?._id ?? null);
  };

  if (sections.length === 0) {
    return (
      <p data-testid="trip-timeline" className="px-4 py-8 text-center text-sm text-ink-3">
        No expenses to show for this trip yet.
      </p>
    );
  }

  return (
    <ol data-testid="trip-timeline" aria-label="Trip timeline" className={LEDGER_CONTAINER}>
      {sections.map((section) => {
        const [primary, secondary] = section.label.split(" · ");
        const count = section.items.length;
        return (
          <li key={section.key} aria-label={section.label}>
            <div
              className={cn(
                "flex items-center justify-between gap-3 border-t border-rule bg-sunk py-2 pr-4",
                nested ? "pl-[38px]" : "pl-4"
              )}
            >
              <h3 className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-ink">
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full shadow-[0_0_0_3px_var(--tint-2)]",
                    section.kind === "day" ? "bg-accent" : "bg-bar"
                  )}
                />
                <span className="ell">
                  {primary}
                  <span className="font-normal text-ink-3">
                    {secondary ? ` · ${secondary}` : ""} · {count} expense{count !== 1 ? "s" : ""}
                  </span>
                </span>
              </h3>
              <span className="num shrink-0 text-[13px] text-ink-2" title="Section total">
                {formatBaseCurrency(section.total)}
              </span>
            </div>
            <div>
              {section.items.map((expense) => (
                <ExpenseRow
                  key={expense._id}
                  expense={expense}
                  variant="trip"
                  nested={nested}
                  showDate={section.kind !== "day"}
                  selected={openId === expense._id}
                  onSelect={() => toggle(expense)}
                  inlineDetail={inlineDetail}
                  detailId={detailId}
                  editHref={expenseEditHref(expense._id, returnTo)}
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
