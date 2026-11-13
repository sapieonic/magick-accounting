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
