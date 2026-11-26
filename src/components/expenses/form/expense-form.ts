import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { moneyToCents } from "@/lib/asset";
import { getPaymentEntriesError, getPaymentSplitError } from "@/lib/expense";
import { paymentDraftsToPayload } from "@/components/expenses/PaymentSourceFields";
import type { ExpenseFormValues } from "./types";

/** The lookups both expense forms load (payer options included). */
export const LOOKUPS_URL = "/api/lookups?include=departments,categories,currencies,members";

export const MAX_RECEIPT_SIZE = 10 * 1024 * 1024; // 10MB
export const RECEIPT_TOO_LARGE = "File too large. Maximum size is 10MB.";

/**
 * Payment validation for the form. `splitError` / `paymentsError` block
 * submit; the `visible*` variants are what shows inline while typing.
 */
export function getPaymentErrors(values: ExpenseFormValues) {
  const splitError =
    values.paymentSource === "split" ? getPaymentSplitError(values.amount, values.pocketAmount) : null;
  // The browser's `required` check covers an empty pocket field; a filled-in
  // one errors as soon as it (or the amount, once entered) stops fitting.
  const visibleSplitError = values.pocketAmount !== "" && values.amount !== "" ? splitError : null;
  const paymentsError =
    values.paymentSource === "multiple"
      ? getPaymentEntriesError(values.amount, paymentDraftsToPayload("multiple", values.payments))
      : null;
  // As above: blank payer rows are left to `required`; once every row is
  // filled in, a mismatch with the total shows inline.
  const visiblePaymentsError =
    values.amount !== "" && values.payments.every((entry) => entry.paidBy && entry.amount !== "")
      ? paymentsError
      : null;
  return { splitError, visibleSplitError, paymentsError, visiblePaymentsError };
}

function parseGst(values: ExpenseFormValues): number | null {
  return values.gstAmount ? parseFloat(values.gstAmount) : null;
}

/** The first rule the GST or payment fields break, if any (checked on submit). */
export function getSubmitError(values: ExpenseFormValues): string | null {
  const gstAmount = parseGst(values);
  if (gstAmount != null && moneyToCents(gstAmount) > moneyToCents(values.amount)) {
    return "GST amount cannot exceed the total amount";
  }
  const { splitError, paymentsError } = getPaymentErrors(values);
  return splitError ?? paymentsError;
}

/** The fields `POST /api/expenses` and `PUT /api/expenses/:id` share. */
export function toExpensePayload(values: ExpenseFormValues) {
  return {
    ...values,
    amount: parseFloat(values.amount),
    gstAmount: parseGst(values),
    pocketAmount: values.paymentSource === "split" ? parseFloat(values.pocketAmount) : null,
    payments: paymentDraftsToPayload(values.paymentSource, values.payments),
    trip: values.trip || null,
    travelType: values.trip ? values.travelType : null,
  };
}

/**
 * The reviewed fields of a form, normalised the way `PUT /api/expenses/:id`
 * compares them (title and description trimmed, amounts in cents, payer rows
 * order-free). The trip and travel type are left out: moving an expense into
 * or out of a trip never needs re-approval.
 */
function accountingSnapshot(values: ExpenseFormValues): string {
  const payments =
    paymentDraftsToPayload(values.paymentSource, values.payments)
      ?.map((entry) => `${entry.paidBy.trim().toLowerCase()}:${entry.source}:${moneyToCents(entry.amount)}`)
      .sort() ?? [];
  return JSON.stringify([
    values.title.trim(),
    values.description.trim(),
    moneyToCents(values.amount),
    values.gstAmount === "" ? null : moneyToCents(values.gstAmount),
    values.currency,
    values.date,
    values.category,
    values.department,
    values.paymentSource,
    values.paymentSource === "split" ? moneyToCents(values.pocketAmount) : null,
    payments,
  ]);
}

/**
 * Whether saving `current` over `initial` changes a reviewed field: title,
 * description (both trimmed), amount, GST, currency, date, category,
 * department, who paid (source, pocket share, payers) or the receipt
 * (`receiptChanged`). Client mirror of the server's protected-field check
 * (`changedProtectedField`), which sends an approved expense its submitter
 * edits back for approval and which a user can't pass on an expense with
 * linked assets. The trip and travel type aren't reviewed.
 */
export function accountingFieldsChanged(
  initial: ExpenseFormValues,
  current: ExpenseFormValues,
  receiptChanged = false
): boolean {
  return receiptChanged || accountingSnapshot(initial) !== accountingSnapshot(current);
}

/** An amount as typed, compared by value: "1000" and "1000.00" are the same. */
function moneyKey(value: string): string | number {
  const trimmed = value.trim();
  return trimmed !== "" && Number.isFinite(Number(trimmed)) ? moneyToCents(trimmed) : trimmed;
}

/**
 * The form's fields in the groups a conflict merges, each with the name the
 * form shows. Who paid and the trip are merged whole: a pocket share or payer
 * list only means something with its payment source, a travel type with its trip.
 */
const MERGE_GROUPS: { label: string; key: (values: ExpenseFormValues) => unknown; fields: (keyof ExpenseFormValues)[] }[] = [
  { label: "Title", key: (v) => v.title, fields: ["title"] },
  { label: "Amount", key: (v) => moneyKey(v.amount), fields: ["amount"] },
  { label: "GST amount", key: (v) => moneyKey(v.gstAmount), fields: ["gstAmount"] },
  { label: "Currency", key: (v) => v.currency, fields: ["currency"] },
  { label: "Date", key: (v) => v.date, fields: ["date"] },
  { label: "Category", key: (v) => v.category, fields: ["category"] },
  { label: "Department", key: (v) => v.department, fields: ["department"] },
  {
    label: "Who paid",
    key: (v) => [
      v.paymentSource,
      v.paymentSource === "split" ? moneyKey(v.pocketAmount) : null,
      paymentDraftsToPayload(v.paymentSource, v.payments)?.map((p) => [p.paidBy, p.amount == null ? null : moneyToCents(p.amount), p.source]) ?? null,
    ],
    fields: ["paymentSource", "pocketAmount", "payments"],
  },
  { label: "Description", key: (v) => v.description, fields: ["description"] },
  { label: "Business trip", key: (v) => [v.trip, v.trip ? v.travelType : null], fields: ["trip", "travelType"] },
];

export interface ConflictMerge {
  /** The form after the merge: the person's edits on top of the saved expense. */
  values: ExpenseFormValues;
  /** Fields (as the form names them) the person changed that were also changed, differently, by someone else. */
  overlaps: string[];
}

/**
 * Three-way merge after a save was refused because the expense changed
 * meanwhile. For each field: one the person didn't touch (`mine` equals
 * `base`, the version the edit started from) takes the saved value
 * (`theirs`); one they changed keeps their value. A field both changed, to
 * different values, keeps the person's and is listed in `overlaps`, so the
 * page can ask them to check it before saving again.
 */
export function mergeAfterConflict(
  base: ExpenseFormValues,
  mine: ExpenseFormValues,
  theirs: ExpenseFormValues
): ConflictMerge {
  const values: ExpenseFormValues = { ...mine };
  const overlaps: string[] = [];
  const same = (a: ExpenseFormValues, b: ExpenseFormValues, key: (values: ExpenseFormValues) => unknown) =>
    JSON.stringify(key(a)) === JSON.stringify(key(b));
  for (const group of MERGE_GROUPS) {
    if (same(mine, base, group.key)) {
      for (const field of group.fields) Object.assign(values, { [field]: theirs[field] });
    } else if (!same(theirs, base, group.key) && !same(mine, theirs, group.key)) {
      overlaps.push(group.label);
    }
  }
  return { values, overlaps };
}

/** "Amount", "Amount and Date", "Title, Amount and Date". */
export function listFields(labels: string[]): string {
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/** Asks the browser to confirm a full page unload while `active`. */
export function useUnsavedChangesWarning(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [active]);
}

/** Uploads a receipt through `/api/upload`, tracking whether one is in flight. */
export function useReceiptUpload() {
  const [uploading, setUploading] = useState(false);
  const upload = useCallback(async (file: File): Promise<{ key: string; filename: string }> => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await api.postFormData("/api/upload", formData);
      return { key: result.key, filename: result.filename };
    } finally {
      setUploading(false);
    }
  }, []);
  return { upload, uploading };
}

/** Best-effort delete of a receipt uploaded for a save that then failed. */
export async function discardUploadedReceipt(key: string | null) {
  if (!key) return;
  await api.delete(`/api/upload?key=${encodeURIComponent(key)}`).catch(() => undefined);
}
