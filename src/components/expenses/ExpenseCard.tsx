"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import {
  ChevronDown, Download, FileText, Image as ImageIcon, Package, Paperclip, Pencil, Plane,
  Trash2, Unlink, User as UserIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import Spinner from "@/components/ui/Spinner";
import { formatCurrency, formatBaseCurrency } from "@/lib/currency";
import { payerName, paymentSourceLabel } from "@/lib/expense-csv";
import { getPaymentBreakdown } from "@/lib/expense";
import { travelTypeLabel } from "@/lib/trip";
import { TravelTypeIcon, TRAVEL_TYPE_CHIP_CLASSES } from "@/components/trips/TravelTypeIcon";
import type { ExpenseListItem } from "@/types/expense";

const CATEGORY_COLORS: Record<string, string> = {
  "Office Supplies": "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30",
  "Travel": "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/30",
  "Meals & Entertainment": "bg-pink-100 text-pink-700 border-pink-200 dark:bg-pink-500/15 dark:text-pink-300 dark:border-pink-500/30",
  "Software & Subscriptions": "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30",
  "Equipment & Hardware": "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-500/15 dark:text-slate-300 dark:border-slate-500/30",
  "Marketing & Advertising": "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
  "Professional Services": "bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-500/15 dark:text-cyan-300 dark:border-cyan-500/30",
  "Utilities": "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-500/15 dark:text-yellow-300 dark:border-yellow-500/30",
  "Rent & Facilities": "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30",
  "Training & Education": "bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30",
  "Communication": "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30",
  "Insurance": "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
  "Miscellaneous": "bg-subtle text-muted border-line",
};

function getCategoryColor(name: string): string {
  return CATEGORY_COLORS[name] || "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30";
}

function paymentSourceDetail(expense: ExpenseListItem): string {
  if (expense.paymentSource !== "split") return paymentSourceLabel(expense.paymentSource);
  const { pocket, company } = getPaymentBreakdown(expense);
  const code = expense.currency?.code;
  return `Split · ${formatCurrency(pocket, code)} pocket / ${formatCurrency(company, code)} company`;
}

function isImageFile(filename?: string): boolean {
  if (!filename) return false;
  return /\.(jpg|jpeg|png|webp)$/i.test(filename);
}

/** Who paid, for the compact row: every payer of a shared bill, else the submitter. */
function expensePayerSummary(expense: ExpenseListItem): string {
  if (expense.paymentSource === "multiple" && expense.payments?.length) {
    const names = [...new Set(expense.payments.map(payerName))];
    if (names.length <= 2) return names.join(" & ");
    return `${names[0]}, ${names[1]} +${names.length - 2}`;
  }
  return expense.createdBy?.name ?? "";
}

interface ExpenseCardProps {
  expense: ExpenseListItem;
  expanded: boolean;
  onToggle: () => void;
  /** Deletes the expense (the caller owns undo); omitted hides Delete. */
  onDelete?: (expense: ExpenseListItem) => void;
  /** Takes the expense out of its trip; omitted hides the action. */
  onRemoveFromTrip?: (expense: ExpenseListItem) => void;
  /** Flat lists: a pill linking to the expense's trip. */
  showTripBadge?: boolean;
  /**
   * `nested` is the compact row used inside a trip timeline: travel type icon,
   * who paid, amount on the right.
   */
  variant?: "default" | "nested";
  /** `nested` only: show the date in the row (off inside a single day section). */
  showDate?: boolean;
  /** Page the edit form goes back to after saving or cancelling, e.g. the trip. */
  returnTo?: string;
}

export default function ExpenseCard({
  expense,
  expanded,
  onToggle,
  onDelete,
  onRemoveFromTrip,
  showTripBadge = false,
  variant = "default",
  showDate = true,
  returnTo,
}: ExpenseCardProps) {
  const { toast } = useToast();
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [receiptFailed, setReceiptFailed] = useState(false);

  const receiptKey = expense.receiptKey;
  // Lazily fetch the presigned receipt URL the first time a row with a
  // receipt is expanded (covers clicks and ?expand= deep links).
  useEffect(() => {
    if (!expanded || !receiptKey || receiptUrl) return;
    let active = true;
    setReceiptFailed(false);
    api
      .get(`/api/upload?key=${encodeURIComponent(receiptKey)}`)
      .then(({ downloadUrl }) => {
        if (active) setReceiptUrl(downloadUrl);
      })
      .catch(() => {
        if (!active) return;
        setReceiptFailed(true);
        toast("Failed to load receipt", "error");
      });
    return () => {
      active = false;
    };
  }, [expanded, receiptKey, receiptUrl, toast]);

  const nested = variant === "nested";
  const isImage = isImageFile(expense.receiptFilename);
  const catColor = getCategoryColor(expense.category?.name);
  const foreign = Boolean(expense.currency && !expense.currency.isBase && expense.amountInBaseCurrency != null);
  const trip = expense.trip ?? null;
  const tripBadge = showTripBadge && trip ? trip : null;
  const editHref = `/dashboard/expenses/${expense._id}/edit${
    returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""
  }`;

  const quickActions = (
    <div
      className={`absolute top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded-lg border border-line bg-surface/95 p-1 opacity-0 shadow-sm backdrop-blur-sm transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100 sm:flex ${
        nested ? "right-[11rem]" : "right-14"
      }`}
    >
      <Link
        href={editHref}
        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-subtle hover:text-foreground"
        aria-label={`Edit ${expense.title}`}
        title="Edit"
      >
        <Pencil className="h-4 w-4" />
      </Link>
      {onRemoveFromTrip && (
        <button
          onClick={() => onRemoveFromTrip(expense)}
          className="cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-amber-50 hover:text-amber-700 dark:hover:bg-amber-500/10 dark:hover:text-amber-300"
          aria-label={`Remove ${expense.title} from trip`}
          title="Remove from trip"
        >
          <Unlink className="h-4 w-4" />
        </button>
      )}
      {onDelete && (
        <button
          onClick={() => onDelete(expense)}
          className="cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
          aria-label={`Delete ${expense.title}`}
          title="Delete"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );

  const titleLine = (
    <div className="flex items-center gap-2">
      <p className="truncate text-sm font-medium text-foreground">{expense.title}</p>
      {expense.receiptKey && (
        <Paperclip className="h-3.5 w-3.5 flex-shrink-0 text-blue-400 dark:text-blue-300" />
      )}
      {(expense.linkedAssetCount || 0) > 0 && (
        <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
          <Package className="h-3 w-3" /> {expense.linkedAssetCount}
        </span>
      )}
    </div>
  );

  const chevron = (
    <ChevronDown
      className={`h-5 w-5 flex-shrink-0 text-muted-foreground transition-transform duration-200 ${
        expanded ? "rotate-180 text-brand-500" : ""
      }`}
    />
  );

  return (
    <div
      className={`overflow-hidden rounded-xl border bg-surface shadow-sm transition-all duration-200 ${
        expanded ? "border-brand-200 shadow-md shadow-brand-500/5 dark:border-brand-500/40" : "border-line hover:border-line-strong hover:shadow-md"
      }`}
    >
      {/* Summary row */}
      <div className="group relative">
        {nested ? (
          <button
            onClick={onToggle}
            className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-3 text-left transition-colors hover:bg-subtle/50 sm:gap-3 sm:px-4"
            aria-expanded={expanded}
          >
            <span
              className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full sm:h-9 sm:w-9 ${
                TRAVEL_TYPE_CHIP_CLASSES[expense.travelType ?? "none"]
              }`}
              title={travelTypeLabel(expense.travelType)}
            >
              <TravelTypeIcon type={expense.travelType} className="h-4 w-4" />
            </span>

            <div className="min-w-0 flex-1">
              {titleLine}
              <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                <span className="truncate font-medium text-muted">
                  {expense.travelType ? travelTypeLabel(expense.travelType) : expense.category?.name}
                </span>
                {showDate && (
                  <>
                    <span aria-hidden="true">&middot;</span>
                    <span className="flex-shrink-0">{format(new Date(expense.date), "d MMM")}</span>
                  </>
                )}
                <span className="hidden sm:inline" aria-hidden="true">&middot;</span>
                <span className="hidden min-w-0 items-center gap-1 truncate sm:inline-flex">
                  <UserIcon className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
                  <span className="truncate">{expensePayerSummary(expense)}</span>
                </span>
              </div>
            </div>

            <div className="flex-shrink-0 text-right tabular-nums sm:w-28">
              <p className="text-sm font-bold text-foreground">
                {formatCurrency(expense.amount, expense.currency?.code)}
              </p>
              {foreign && (
                <p className="text-[11px] text-muted-foreground">{formatBaseCurrency(expense.amountInBaseCurrency!)}</p>
              )}
            </div>

            {chevron}
          </button>
        ) : (
          <button
            onClick={onToggle}
            className={`flex w-full cursor-pointer items-center gap-4 px-5 text-left transition-colors hover:bg-subtle/50 ${
              tripBadge ? "pb-10 pt-4" : "py-4"
            }`}
            aria-expanded={expanded}
          >
            {/* Amount with colored left accent */}
            <div className="w-28 flex-shrink-0 tabular-nums">
              <p className="text-sm font-bold text-foreground">
                {formatCurrency(expense.amount, expense.currency?.code)}
              </p>
              {foreign && (
                <p className="text-[11px] text-muted-foreground">{formatBaseCurrency(expense.amountInBaseCurrency!)}</p>
              )}
            </div>

            {/* Title & meta */}
            <div className="min-w-0 flex-1">
              {titleLine}
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold ${catColor}`}>
                  {expense.category?.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {expense.department?.name}
                </span>
                <span className="text-xs text-muted-foreground">&middot;</span>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(expense.date), "MMM d, yyyy")}
                </span>
                <span className="hidden text-xs text-muted-foreground sm:inline">&middot;</span>
                <span className="hidden text-xs text-muted-foreground sm:inline">{expense.createdBy?.name}</span>
              </div>
            </div>

            {chevron}
          </button>
        )}

        {/* Trip pill: a sibling of the row button (links can't nest in buttons),
            laid over the row's bottom padding under the title column. */}
        {tripBadge && (
          <Link
            href={`/dashboard/trips/${tripBadge._id}`}
            className="absolute bottom-3 left-[148px] inline-flex w-fit max-w-[calc(100%_-_148px_-_3rem)] items-center gap-1.5 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 ring-1 ring-inset ring-sky-200 transition-colors hover:bg-sky-100 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/30 dark:hover:bg-sky-500/20"
            title={`Open trip: ${tripBadge.name}`}
          >
            <Plane className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
            <span className="truncate">{tripBadge.name}</span>
            {expense.travelType && (
              <span className="hidden flex-shrink-0 font-medium opacity-75 sm:inline">
                &middot; {travelTypeLabel(expense.travelType)}
              </span>
            )}
          </Link>
        )}

        {/* Quick actions, shown on hover/focus without expanding the row */}
        {quickActions}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="animate-slide-up border-t border-line">
          <div className={`bg-gradient-to-b from-subtle/80 to-surface ${nested ? "px-3 py-4 sm:px-4" : "px-5 py-5"}`}>
            <div className={`grid gap-4 sm:grid-cols-2 ${nested ? "2xl:grid-cols-3" : "lg:grid-cols-4"}`}>
              <div className="rounded-lg bg-surface p-3 shadow-sm border border-line">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Amount</p>
                <p className="mt-1 text-base font-bold tabular-nums text-foreground">
                  {formatCurrency(expense.amount, expense.currency?.code)}
                </p>
                {foreign && (
                  <p className="text-xs text-emerald-600 font-medium dark:text-emerald-400">
                    {formatBaseCurrency(expense.amountInBaseCurrency!)}
                  </p>
                )}
              </div>
              {expense.gstAmount != null && expense.gstAmount > 0 && (
                <div className="rounded-lg bg-surface p-3 shadow-sm border border-line">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">GST (incl.)</p>
                  <p className="mt-1 text-base font-bold tabular-nums text-foreground">
                    {formatCurrency(expense.gstAmount, expense.currency?.code)}
                  </p>
                </div>
              )}
              <div className="rounded-lg bg-surface p-3 shadow-sm border border-line">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Category</p>
                <span className={`mt-1.5 inline-flex rounded-md border px-2.5 py-0.5 text-xs font-semibold ${catColor}`}>
                  {expense.category?.name}
                </span>
              </div>
              <div className="rounded-lg bg-surface p-3 shadow-sm border border-line">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Department</p>
                <p className="mt-1 text-sm font-medium text-foreground">{expense.department?.name}</p>
              </div>
              <div className="rounded-lg bg-surface p-3 shadow-sm border border-line">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Paid from</p>
                {expense.paymentSource === "multiple" && expense.payments?.length ? (
                  <ul className="mt-1 space-y-0.5 text-sm text-foreground">
                    {expense.payments.map((entry, index) => (
                      <li key={index}>
                        <span className="font-medium">{payerName(entry)}</span>{" "}
                        <span className="tabular-nums">{formatCurrency(entry.amount, expense.currency?.code)}</span>{" "}
                        <span className="text-xs text-muted-foreground">
                          · {entry.source === "company" ? "company" : "pocket"}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-sm font-medium text-foreground">{paymentSourceDetail(expense)}</p>
                )}
              </div>
              <div className="rounded-lg bg-surface p-3 shadow-sm border border-line">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Submitted by</p>
                <p className="mt-1 text-sm font-medium text-foreground">{expense.createdBy?.name}</p>
                <p className="text-xs text-muted-foreground">{format(new Date(expense.date), "MMMM d, yyyy")}</p>
              </div>
              {!nested && trip && (
                <div className="rounded-lg bg-surface p-3 shadow-sm border border-line">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Trip</p>
                  <Link
                    href={`/dashboard/trips/${trip._id}`}
                    className="mt-1 inline-flex max-w-full items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
                  >
                    <Plane className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                    <span className="truncate">{trip.name}</span>
                  </Link>
                  {expense.travelType && (
                    <span
                      className={`mt-1.5 flex w-fit items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${TRAVEL_TYPE_CHIP_CLASSES[expense.travelType]}`}
                    >
                      <TravelTypeIcon type={expense.travelType} className="h-3 w-3" />
                      {travelTypeLabel(expense.travelType)}
                    </span>
                  )}
                </div>
              )}
            </div>

            {expense.description && (
              <div className="mt-4 rounded-lg bg-surface p-3 shadow-sm border border-line">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Description</p>
                <p className="mt-1 text-sm text-muted">{expense.description}</p>
              </div>
            )}

            {/* Receipt preview */}
            {expense.receiptKey && (
              <div className="mt-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="rounded-md bg-blue-50 p-1 dark:bg-blue-500/10">
                      {isImage ? <ImageIcon className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" /> : <FileText className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />}
                    </div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Receipt</p>
                    {expense.receiptFilename && (
                      <span className="truncate text-xs text-muted-foreground">{expense.receiptFilename}</span>
                    )}
                  </div>
                  {receiptUrl && (
                    <button onClick={() => window.open(receiptUrl, "_blank")} className="btn-ghost py-1 text-xs">
                      <Download className="h-3.5 w-3.5" /> Download
                    </button>
                  )}
                </div>

                <div className="mt-2 overflow-hidden rounded-lg border border-line bg-surface shadow-sm">
                  {receiptUrl ? (
                    isImage ? (
                      <img src={receiptUrl} alt={`Receipt for ${expense.title}`} className="max-h-[500px] w-full object-contain" />
                    ) : (
                      <iframe src={receiptUrl} title={`Receipt for ${expense.title}`} className="h-[500px] w-full" />
                    )
                  ) : receiptFailed ? (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                      <FileText className="mb-2 h-8 w-8" />
                      <p className="text-sm">Could not load receipt preview</p>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center py-16">
                      <Spinner size="md" />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
              <Link href={editHref} className="btn-secondary text-sm">
                <Pencil className="h-4 w-4" /> Edit
              </Link>
              {onRemoveFromTrip && (
                <button
                  onClick={() => onRemoveFromTrip(expense)}
                  className="btn-ghost text-sm text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:text-amber-300 dark:hover:bg-amber-500/10 dark:hover:text-amber-200"
                >
                  <Unlink className="h-4 w-4" /> Remove from trip
                </button>
              )}
              {onDelete && (
                <button
                  onClick={() => onDelete(expense)}
                  className="btn-ghost text-sm text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-500/10 dark:hover:text-red-300"
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
