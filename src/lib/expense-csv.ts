import { format } from "date-fns";
import { getPaymentBreakdown, PaymentSplitFields } from "@/lib/expense";

export interface ExpenseCsvSource extends PaymentSplitFields {
  date: string;
  title: string;
  gstAmount?: number | null;
  currency?: { code: string };
  category?: { name: string };
  department?: { name: string };
  createdBy?: { name: string };
  description?: string;
}

export const EXPENSE_CSV_HEADERS = [
  "Date", "Title", "Amount", "GST", "Currency", "Amount (Base)", "Category", "Department",
  "Paid From", "Submitted By", "Description",
  // Appended so existing columns keep their positions for anyone reading by index.
  "Pocket (Base)", "Company (Base)",
];

export function paymentSourceLabel(source?: string | null): string {
  if (source === "company") return "Company account";
  if (source === "split") return "Split";
  return "Pocket";
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
  ];
}
