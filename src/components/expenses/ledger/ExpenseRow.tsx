"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Luggage, Package, Paperclip, Pencil, Trash2, Unlink } from "lucide-react";
import { formatBaseCurrency, formatCurrency } from "@/lib/currency";
import { NOT_IN_TOTALS_SR, effectiveApprovalStatus } from "@/lib/approval";
import { travelTypeLabel } from "@/lib/trip";
import { IconButton } from "@/components/ui/Button";
import CategoryGlyph from "@/components/ui/CategoryGlyph";
import Checkbox from "@/components/ui/Checkbox";
import { cn } from "@/components/ui/cn";
import { ledgerPad, peerFocusRing, rowClass, rowSelectedClass, target24, transition } from "@/components/ui/styles";
import { TravelGlyph } from "@/components/trips/TravelTypeIcon";
import ExpenseDetail, { type ExpenseActions } from "@/components/expenses/ledger/ExpenseDetail";
import PaymentMark from "@/components/expenses/ledger/PaymentMark";
import ApprovalBadge from "@/components/expenses/ApprovalBadge";
import { relativeTime, submittedAt } from "@/components/approvals/approval-format";
import { expenseDate, expensePayerSummary, isForeign } from "@/components/expenses/ledger/format";
import { deleteOffer } from "@/components/expenses/review-status";
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
  /** The ledger with a leading selection checkbox (the review queue). */
  review: {
    grid: "grid-cols-[32px_28px_minmax(0,1fr)_auto] [@container(min-width:620px)]:grid-cols-[32px_56px_minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(104px,auto)] [@container(min-width:620px)]:gap-x-4",
    narrow: "[@container(min-width:620px)]:hidden",
    wide: "hidden [@container(min-width:620px)]:flex",
  },
} as const;

/**
 * Column heads for the expenses ledger; hidden when the rows collapse to two
 * columns. With `select` (a select-all `SelectAllCheckbox`) it lines up with
 * review rows, and the select-all stays on show at every width.
 */
export function LedgerHead({ select }: { select?: ReactNode } = {}) {
  if (!select) {
    return (
      <div
        aria-hidden="true"
        className={cn(
          "hidden items-center gap-x-4 border-t border-rule bg-sunk py-2 text-ink-3 [@container(min-width:620px)]:grid",
          ledgerPad(),
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
  return (
    <div
      className={cn(
        "grid items-center gap-x-3 border-t border-rule bg-sunk py-0.5 text-ink-3",
        ledgerPad(),
        LAYOUT.review.grid
      )}
    >
      {select}
      <span aria-hidden="true" className={cn("cap", LAYOUT.review.wide)}>Date</span>
      <span aria-hidden="true" className={cn("cap", LAYOUT.review.wide)}>Expense</span>
      <span aria-hidden="true" className={cn("cap", LAYOUT.review.wide)}>Category · Department</span>
      <span aria-hidden="true" className={cn("cap justify-end", LAYOUT.review.wide)}>Amount</span>
    </div>
  );
}

/** One row's (or the select-all's) checkbox: an sr-only native input in a 44px label with the `Checkbox` visual. */
function SelectBox({
  checked,
  partial = false,
  onToggle,
  label,
  keyShortcut,
  wideLabel,
}: {
  checked: boolean;
  partial?: boolean;
  onToggle: () => void;
  label: string;
  keyShortcut?: string;
  /** Visible text beside the box (the select-all row on narrow widths). */
  wideLabel?: ReactNode;
}) {
  return (
    <label
      className={cn(
        // Above the title button's row-wide click target, so a tap here only toggles.
        "relative z-10 -ml-2 flex min-h-11 min-w-11 cursor-pointer items-center gap-2 self-stretch pl-2",
        wideLabel && "col-span-2 [@container(min-width:620px)]:col-span-1"
      )}
    >
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        ref={(el) => {
          if (el) el.indeterminate = partial && !checked;
        }}
        onChange={onToggle}
        aria-label={label}
        aria-keyshortcuts={keyShortcut}
      />
      <Checkbox checked={checked} partial={partial} className={peerFocusRing} />
      {wideLabel && <span className="text-[13px] text-ink-2 [@container(min-width:620px)]:sr-only">{wideLabel}</span>}
    </label>
  );
}

/** The select-all for `LedgerHead`'s `select` slot: checked, partial (some) or empty. */
export function SelectAllCheckbox({
  selected,
  total,
  onToggle,
}: {
  selected: number;
  total: number;
  onToggle: () => void;
}) {
  const all = total > 0 && selected === total;
  return (
    <SelectBox
      checked={all}
      partial={selected > 0 && !all}
      onToggle={onToggle}
      label={all ? "Deselect all" : `Select all ${total}`}
      wideLabel={all ? "Deselect all" : `Select all ${total}`}
    />
  );
}

/** The row's checkbox state in the review queue. */
export interface RowSelection {
  checked: boolean;
  onToggle: () => void;
  /** Accessible name, e.g. "Select Taxi, ₹450.00". */
  label: string;
  /** e.g. "X" on the queue page. */
  keyShortcut?: string;
  /**
   * The row can't be part of a selection (the viewer's own expense in the
   * queue): its checkbox cell stays empty, so the columns still line up.
   */
  unavailable?: boolean;
}

interface ExpenseRowProps extends ExpenseActions {
  expense: ExpenseListItem;
  /** The row is open: its detail shows (inline, or in the page's side panel). */
  selected: boolean;
  onSelect: () => void;
  /**
   * "ledger": date · expense · category · amount. "trip": travel type · expense · amount.
   * "review": the ledger for the review queue: "submitted … ago" in the sub-line,
   * plus a leading checkbox while `selection` is given.
   */
  variant?: "ledger" | "trip" | "review";
  /** `review` rows: the selection checkbox (omit to hide the checkbox column). */
  selection?: RowSelection;
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
 * a sub-line with the payer and a payment-source chip, and the amount with
 * its INR equivalent. The title button covers the row; the chip sits above
 * that layer so its name can be read on hover. Quick actions appear on hover.
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
  review,
  canModify,
  selection,
}: ExpenseRowProps) {
  const modifiable = !canModify || canModify(expense);
  const isReview = variant === "review";
  const checkable = isReview && Boolean(selection);
  const layout = checkable ? LAYOUT.review : LAYOUT[isReview ? "ledger" : (variant as "ledger" | "trip")];
  const isTrip = variant === "trip";
  const status = effectiveApprovalStatus(expense);
  // The queue lists only pending expenses, so it doesn't badge (or mute) each one.
  const flagStatus = status !== "approved" && !(isReview && status === "pending");
  const submitted = isReview ? relativeTime(submittedAt(expense)) : null;
  const code = expense.currency?.code;
  const payer = expensePayerSummary(expense);
  const date = expenseDate(expense);
  const typeLabel = travelTypeLabel(expense.travelType);
  // An untagged trip expense is named by its category instead of "Untagged".
  const kindLabel = expense.travelType ? typeLabel : expense.category?.name || typeLabel;
  const assets = expense.linkedAssetCount || 0;
  const trip = showTripLink ? expense.trip : null;
  const inlineId = detailId ?? `expense-detail-${expense._id}`;

  // Narrow rows fold the hidden columns into the sub-line (the glyph alone
  // doesn't name the category: it's decorative).
  const narrowSub = isTrip
    ? [kindLabel, showDate && date, payer].filter(Boolean).join(" · ")
    : [expense.category?.name, date, payer].filter(Boolean).join(" · ");
  const submittedText = submitted ? `submitted ${submitted}` : null;
  // In the queue, an admin's own expense waits for another admin.
  const ownText =
    isReview && review?.viewerId && review.viewerId === expense.createdBy?._id && (review.onApprove || review.onReject)
      ? "yours — another admin reviews it"
      : null;
  const narrowSubText = [narrowSub, submittedText, ownText].filter(Boolean).join(" · ");
  const wideSub = [payer, isTrip && showDate && date, submittedText, ownText].filter(Boolean).join(" · ");

  return (
    <div className={cn(selected && inlineDetail && "border-b border-rule-2")} data-expense-row={expense._id}>
      <div
        className={cn(
          "group relative grid min-h-[58px] items-center gap-x-3 py-2",
          ledgerPad(nested),
          nested && "bg-background",
          layout.grid,
          rowClass,
          selected && rowSelectedClass
        )}
      >
        {checkable && selection && !selection.unavailable && (
          <SelectBox
            checked={selection.checked}
            onToggle={selection.onToggle}
            label={selection.label}
            keyShortcut={selection.keyShortcut}
          />
        )}
        {checkable && selection?.unavailable && <span aria-hidden="true" />}
        {isTrip ? (
          <span className="flex min-w-0 items-center gap-2.5 text-ink-2">
            <TravelGlyph type={expense.travelType} />
            <span className={cn("ell", layout.wide)}>{kindLabel}</span>
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
              data-row-title=""
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
            {flagStatus && <ApprovalBadge status={status} className="shrink-0" />}
            {/* Above the title button's row-wide layer, so the chip's name shows
                on hover. A click here still opens the row. */}
            <span className="relative z-10 inline-flex shrink-0 cursor-pointer" onClick={onSelect}>
              <PaymentMark expense={expense} />
            </span>
            <span className={cn("ell", layout.narrow)}>{narrowSubText}</span>
            <span className={cn("ell", layout.wide)}>{wideSub}</span>
          </span>
          {trip && (
            <Link
              href={`/dashboard/trips/${trip._id}`}
              title={`Open trip: ${trip.name}`}
              className={cn(
                target24,
                "relative z-10 w-fit max-w-full gap-1 text-xs font-medium text-cat-tr hover:text-ink",
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

        {/* The amount and the hover actions share one grid cell, so the cell is
            as wide as the wider of the two: the actions cover the amount
            (hidden meanwhile) and never the columns before it. */}
        <span className="grid items-center justify-items-end">
          {/* Hidden while the hover actions cover it. */}
          <span
            className={cn(
              "flex flex-col items-end [grid-area:1/1]",
              "sm:[@media(hover:hover)]:group-hover:invisible sm:[@media(hover:hover)]:group-has-[[data-row-actions]:focus-within]:invisible"
            )}
          >
            <span
              className={cn(
                "num whitespace-nowrap font-medium",
                flagStatus ? "text-ink-3" : "text-ink",
                flagStatus && status === "rejected" && "line-through"
              )}
            >
              {formatCurrency(expense.amount, code)}
              {flagStatus && <span className="sr-only">{NOT_IN_TOTALS_SR[status]}</span>}
            </span>
            {isForeign(expense) && (
              <span className={cn("num whitespace-nowrap text-xs text-ink-3", flagStatus && status === "rejected" && "line-through")}>
                {formatBaseCurrency(expense.amountInBaseCurrency!)}
              </span>
            )}
          </span>

          {/* Quick actions on hover/focus, without opening the row, over the
              amount. Only where the pointer can hover (else display:none, so
              they don't widen the cell): on touch the row opens its detail,
              which has the same actions. While hidden they don't take clicks either. */}
          {modifiable && (
          <span
            data-testid="row-actions"
            data-row-actions=""
            className={cn(
              // Above the title button's row-wide click target.
              "relative z-10 hidden items-center gap-0.5 rounded-control border border-rule bg-surface p-0.5 transition-opacity duration-140 [grid-area:1/1]",
              "pointer-events-none opacity-0 focus-within:pointer-events-auto focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100",
              "sm:[@media(hover:hover)]:flex"
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
            {/* Only where the viewer may delete it; the detail says why when they can't. */}
            {onDelete && deleteOffer(expense, { onDelete, review }) === "delete" && (
              <IconButton
                icon={Trash2}
                variant="ghost-danger"
                size="sm"
                onClick={() => onDelete(expense)}
                aria-label={`Delete ${expense.title}`}
              />
            )}
          </span>
          )}
        </span>
      </div>

      {selected && inlineDetail && (
        <ExpenseDetail
          id={inlineId}
          expense={expense}
          editHref={editHref}
          onDelete={onDelete}
          onRemoveFromTrip={onRemoveFromTrip}
          review={review}
          canModify={canModify}
          showTrip={!isTrip}
          className={cn("animate-slide-up bg-background py-4", ledgerPad(nested))}
        />
      )}
    </div>
  );
}
