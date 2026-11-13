import { format, parseISO } from "date-fns";
import { formatBaseCurrency, formatCurrency } from "@/lib/currency";
import { getPaymentBreakdown } from "@/lib/expense";
import { payerName, paymentSourceLabel } from "@/lib/expense-csv";
import { dayKey } from "@/lib/trip";
import type { ExpenseListItem } from "@/types/expense";

/** The expense's calendar day, formatted (dates are stored at UTC midnight of that day). */
export function expenseDate(expense: Pick<ExpenseListItem, "date">, pattern = "d MMM"): string {
  return format(parseISO(dayKey(expense.date)), pattern);
}

/** Paid in a currency other than the base one, with a stored conversion. */
export function isForeign(
  expense: { currency?: { isBase: boolean } | null } & Pick<ExpenseListItem, "amountInBaseCurrency">
): boolean {
  return Boolean(expense.currency && !expense.currency.isBase && expense.amountInBaseCurrency != null);
}

/** "= ₹2,782.08 at ₹96.00 per USD, fixed on entry" for foreign amounts. */
export function conversionNote(expense: ExpenseListItem): string | null {
  if (!isForeign(expense) || !expense.amount) return null;
  const base = expense.amountInBaseCurrency!;
  const rate = base / expense.amount;
  return `= ${formatBaseCurrency(base)} at ${formatBaseCurrency(rate)} per ${expense.currency!.code}, fixed on entry`;
}

/** Who paid, for a compact row: every payer of a shared bill, else the submitter. */
export function expensePayerSummary(expense: ExpenseListItem): string {
  if (expense.paymentSource === "multiple" && expense.payments?.length) {
    const names = [...new Set(expense.payments.map(payerName))];
    if (names.length <= 2) return names.join(" & ");
    return `${names[0]}, ${names[1]} +${names.length - 2}`;
  }
  return expense.createdBy?.name ?? "";
}

/** "Company account", or the split in the bill's own currency. */
export function paymentSourceDetail(expense: ExpenseListItem): string {
  if (expense.paymentSource !== "split") return paymentSourceLabel(expense.paymentSource);
  const { pocket, company } = getPaymentBreakdown(expense);
  const code = expense.currency?.code;
  return `Split · ${formatCurrency(pocket, code)} pocket / ${formatCurrency(company, code)} company`;
}

export function isImageFile(filename?: string): boolean {
  return Boolean(filename && /\.(jpg|jpeg|png|webp)$/i.test(filename));
}

/** The edit form, optionally returning to `returnTo` (e.g. a trip) afterwards. */
export function expenseEditHref(expenseId: string, returnTo?: string): string {
  return `/dashboard/expenses/${expenseId}/edit${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`;
}

/** Base-currency amount of an expense (falls back to the bill amount). */
export function baseAmount(expense: Pick<ExpenseListItem, "amount" | "amountInBaseCurrency">): number {
  return expense.amountInBaseCurrency ?? expense.amount ?? 0;
}
