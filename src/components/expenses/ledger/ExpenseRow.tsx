"use client";

import Link from "next/link";
import { Luggage, Package, Paperclip, Pencil, Trash2, Unlink } from "lucide-react";
import { formatBaseCurrency, formatCurrency } from "@/lib/currency";
import { paymentSourceLabel } from "@/lib/expense-csv";
import { travelTypeLabel } from "@/lib/trip";
import { IconButton } from "@/components/ui/Button";
import CategoryGlyph from "@/components/ui/CategoryGlyph";
import { cn } from "@/components/ui/cn";
import { rowClass, rowSelectedClass, transition } from "@/components/ui/styles";
import { TravelGlyph } from "@/components/trips/TravelTypeIcon";
import ExpenseDetail, { type ExpenseActions } from "@/components/expenses/ledger/ExpenseDetail";
import PaymentDot from "@/components/expenses/ledger/PaymentDot";
import { expenseDate, expensePayerSummary, isForeign } from "@/components/expenses/ledger/format";
import type { ExpenseListItem } from "@/types/expense";

/*
 * Ledger rows lay out against their list's width, not the viewport: the
 * list sets `[container-type:inline-size]` (see LEDGER_CONTAINER) and these
 * class lists switch at 620px (the expenses ledger) or 560px (a trip's days).
 * They're literal so Tailwind generates them.
 */
export const LEDGER_CONTAINER = "[container-type:inline-size]";

const LAYOUT = {
  ledger: {
    grid: "grid-cols-[28px_minmax(0,1fr)_auto] [@container(min-width:620px)]:grid-cols-[56px_minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(104px,auto)] [@container(min-width:620px)]:gap-x-4",
    narrow: "[@container(min-width:620px)]:hidden",
    wide: "hidden [@container(min-width:620px)]:flex",
  },
  trip: {
    grid: "grid-cols-[28px_minmax(0,1fr)_auto] [@container(min-width:560px)]:grid-cols-[150px_minmax(0,1fr)_auto] [@container(min-width:560px)]:gap-x-4",
    narrow: "[@container(min-width:560px)]:hidden",
    wide: "hidden [@container(min-width:560px)]:flex",
  },
} as const;

/** Column heads for the expenses ledger; hidden when the rows collapse to two columns. */
export function LedgerHead() {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "hidden items-center gap-x-4 border-t border-rule bg-sunk px-4 py-2 text-ink-3 [@container(min-width:620px)]:grid",
        LAYOUT.ledger.grid
      )}
    >
      <span className="cap">Date</span>
      <span className="cap">Expense</span>
      <span className="cap">Category · Department</span>
      <span className="cap text-right">Amount</span>
    </div>
  );
}

export interface ExpenseRowProps extends ExpenseActions {
  expense: ExpenseListItem;
  /** The row is open: its detail shows (inline, or in the page's side panel). */
  selected: boolean;
  onSelect: () => void;
  /** "ledger": date · expense · category · amount. "trip": travel type · expense · amount. */
  variant?: "ledger" | "trip";
  /** `trip` rows: show the date (off inside a single day's section). */
  showDate?: boolean;
  /** Indented on the page background: an expense inside a trip band. */
  nested?: boolean;
  /** Flat lists: a link to the expense's trip under the title. */
  showTripLink?: boolean;
  /** Render the detail under the row while selected (else the caller shows it elsewhere). */
  inlineDetail?: boolean;
  editHref: string;
  /** Id of the element showing this row's detail (aria-controls). */
  detailId?: string;
}

/**
 * One dense ledger row: glyph chip, title (with receipt and asset marks),
 * a muted sub-line with a payment dot, and the amount with its INR
 * equivalent. The title button covers the row; quick actions appear on hover.
 */
export default function ExpenseRow({
  expense,
  selected,
  onSelect,
  variant = "ledger",
  showDate = true,
  nested = false,
  showTripLink = false,
  inlineDetail = true,
  editHref,
  detailId,
  onDelete,
  onRemoveFromTrip,
}: ExpenseRowProps) {
  const layout = LAYOUT[variant];
  const isTrip = variant === "trip";
  const code = expense.currency?.code;
  const payer = expensePayerSummary(expense);
  const source = paymentSourceLabel(expense.paymentSource);
  const date = expenseDate(expense);
  const typeLabel = travelTypeLabel(expense.travelType);
  const assets = expense.linkedAssetCount || 0;
  const trip = showTripLink ? expense.trip : null;
  const inlineId = detailId ?? `expense-detail-${expense._id}`;

  // Narrow rows fold the hidden columns into the sub-line.
  const narrowSub = isTrip
    ? [typeLabel, showDate && date, payer].filter(Boolean).join(" · ")
    : [expense.department?.name, date, payer].filter(Boolean).join(" · ");
  const wideSub = [payer, source, isTrip && showDate && date].filter(Boolean).join(" · ");

  return (
    <div className={cn(selected && inlineDetail && "border-b border-rule-2")}>
      <div
        className={cn(
          "group relative grid min-h-[58px] items-center gap-x-3 py-2 pr-4",
          nested ? "bg-background pl-[38px]" : "pl-4",
          layout.grid,
          rowClass,
          selected && rowSelectedClass
        )}
      >
        {isTrip ? (
          <span className="flex min-w-0 items-center gap-2.5 text-ink-2">
            <TravelGlyph type={expense.travelType} />
            <span className={cn("ell", layout.wide)}>{typeLabel}</span>
          </span>
        ) : (
          <>
            <CategoryGlyph name={expense.category?.name} className={layout.narrow} />
            <span className={cn("num text-xs text-ink-3", layout.wide)}>{date}</span>
          </>
        )}

        <span className="flex min-w-0 flex-col gap-px">
          <span className="flex min-w-0 items-center gap-1.5">
            <button
              type="button"
              onClick={onSelect}
              aria-expanded={selected}
              aria-controls={selected ? (inlineDetail ? inlineId : detailId) : undefined}
              className={cn(
                "ell min-w-0 cursor-pointer text-left font-medium text-ink",
                // The button's box covers the whole row, so a click anywhere opens it.
                "after:absolute after:inset-0 focus-visible:outline-none",
                "focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:outline-accent focus-visible:after:[outline-offset:-2px]"
              )}
            >
              {expense.title}
            </button>
            {expense.receiptKey && (
              <Paperclip role="img" aria-label="Receipt attached" size={13} strokeWidth={1.75} className="shrink-0 text-accent" />
            )}
            {assets > 0 && (
              <span
                title={`${assets} linked asset${assets !== 1 ? "s" : ""}`}
                className="inline-flex shrink-0 items-center gap-0.5 rounded-[5px] bg-accent-soft px-1 text-[11px] font-medium text-accent"
              >
                <Package aria-hidden="true" size={11} strokeWidth={1.75} />
                <span className="num">{assets}</span>
                <span className="sr-only"> linked asset{assets !== 1 ? "s" : ""}</span>
              </span>
            )}
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-ink-3">
            <PaymentDot expense={expense} />
            <span className={cn("ell", layout.narrow)}>{narrowSub}</span>
            <span className={cn("ell", layout.wide)}>{wideSub}</span>
          </span>
          {trip && (
            <Link
              href={`/dashboard/trips/${trip._id}`}
              title={`Open trip: ${trip.name}`}
              className={cn(
                "relative z-10 mt-0.5 inline-flex w-fit max-w-full items-center gap-1 text-xs font-medium text-cat-tr hover:text-ink",
                transition
              )}
            >
              <Luggage aria-hidden="true" size={12} strokeWidth={1.75} className="shrink-0" />
              <span className="ell">{trip.name}</span>
              {expense.travelType && <span className="shrink-0 font-normal text-ink-3">· {typeLabel}</span>}
            </Link>
          )}
        </span>

        {!isTrip && (
          <span className={cn("min-w-0 items-center gap-2.5", layout.wide)}>
            <CategoryGlyph name={expense.category?.name} size="sm" />
            <span className="flex min-w-0 flex-col gap-px">
              <span className="ell">{expense.category?.name}</span>
              <span className="ell text-xs text-ink-3">{expense.department?.name}</span>
            </span>
          </span>
        )}

        <span className="flex flex-col items-end">
          <span className="num whitespace-nowrap font-medium text-ink">{formatCurrency(expense.amount, code)}</span>
          {isForeign(expense) && (
            <span className="num whitespace-nowrap text-xs text-ink-3">{formatBaseCurrency(expense.amountInBaseCurrency!)}</span>
          )}
        </span>

        {/* Quick actions on hover/focus, without opening the row. */}
        <div
          className={cn(
            "absolute right-32 top-1/2 z-10 hidden -translate-y-1/2 items-center gap-0.5 rounded-control border border-rule bg-surface p-0.5 opacity-0 transition-opacity duration-140",
            "focus-within:opacity-100 group-hover:opacity-100 sm:flex"
          )}
        >
          <IconButton icon={Pencil} size="sm" href={editHref} aria-label={`Edit ${expense.title}`} />
          {onRemoveFromTrip && (
            <IconButton
              icon={Unlink}
              size="sm"
              onClick={() => onRemoveFromTrip(expense)}
              aria-label={`Remove ${expense.title} from trip`}
              className="hover:!text-amber"
            />
          )}
          {onDelete && (
            <IconButton
              icon={Trash2}
              size="sm"
              onClick={() => onDelete(expense)}
              aria-label={`Delete ${expense.title}`}
              className="hover:!bg-danger-soft hover:!text-danger"
            />
          )}
        </div>
      </div>

      {selected && inlineDetail && (
        <ExpenseDetail
          id={inlineId}
          expense={expense}
          editHref={editHref}
          onDelete={onDelete}
          onRemoveFromTrip={onRemoveFromTrip}
          showTrip={!isTrip}
          className={cn("animate-slide-up bg-background py-4 pr-4", nested ? "pl-[38px]" : "pl-4")}
        />
      )}
    </div>
  );
}
