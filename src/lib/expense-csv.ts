import { format } from "date-fns";
import { getPaymentBreakdown, PaymentSplitFields } from "@/lib/expense";

export interface ExpensePaymentEntry {
  paidBy?: { name?: string; email?: string } | null;
  amount: number;
  source: string;
}

export interface ExpenseCsvSource extends PaymentSplitFields {
  date: string;
  title: string;
  gstAmount?: number | null;
  currency?: { code: string };
  category?: { name: string };
  department?: { name: string };
  createdBy?: { name: string };
  description?: string;
  payments?: ExpensePaymentEntry[];
}

export const EXPENSE_CSV_HEADERS = [
  "Date", "Title", "Amount", "GST", "Currency", "Amount (Base)", "Category", "Department",
  "Paid From", "Submitted By", "Description",
  // Appended so existing columns keep their positions for anyone reading by index.
  "Pocket (Base)", "Company (Base)", "Payments",
];

export function paymentSourceLabel(source?: string | null): string {
  if (source === "company") return "Company account";
  if (source === "split") return "Split";
  if (source === "multiple") return "Several people";
  return "Pocket";
}

export function payerName(entry: ExpensePaymentEntry): string {
  return entry.paidBy?.name || entry.paidBy?.email || "Unknown user";
}

/**
 * Each payer's part in the expense's own currency (the row's Currency column),
 * e.g. "Asha: 600.00 (Pocket); Ravi: 400.00 (Company account)".
 */
export function describePayments(payments: ExpensePaymentEntry[] | undefined): string {
  return (payments ?? [])
    .map((entry) => `${payerName(entry)}: ${entry.amount.toFixed(2)} (${paymentSourceLabel(entry.source)})`)
    .join("; ");
}

export function expenseCsvRow(e: ExpenseCsvSource): unknown[] {
  const { pocketBase, companyBase } = getPaymentBreakdown(e);
  return [
    format(new Date(e.date), "yyyy-MM-dd"),
    e.title,
    e.amount,
    e.gstAmount ?? "",
    e.currency?.code ?? "",
    e.amountInBaseCurrency ?? e.amount,
    e.category?.name ?? "",
    e.department?.name ?? "",
    paymentSourceLabel(e.paymentSource),
    e.createdBy?.name ?? "",
    e.description ?? "",
    pocketBase,
    companyBase,
    describePayments(e.payments),
  ];
}
