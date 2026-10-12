import { moneyToCents, roundMoney } from "@/lib/asset";

// Kept here (not in the model) so client code can import it without mongoose.
export type PaymentSource = "pocket" | "company" | "split";

export const PAYMENT_SOURCES: PaymentSource[] = ["pocket", "company", "split"];

/**
 * GST is the tax portion *included* in an expense's total `amount` (a receipt
 * total already contains its GST). It is therefore a component of the total and
 * must sit between 0 and the amount, inclusive.
 *
 * Normalizes a raw GST value (from a form or the AI extractor) against the
 * expense total. Returns the cleaned number, or `null` when GST is absent.
 * Throws with a user-facing message when the value is present but invalid.
 */
export function normalizeGstAmount(raw: unknown, amount: number): number | null {
  if (raw === null || raw === undefined || raw === "") return null;

  const gst = Number(raw);
  if (!Number.isFinite(gst) || gst < 0) {
    throw new Error("GST amount must be a valid non-negative number");
  }
  if (Number.isFinite(amount) && gst > amount) {
    throw new Error("GST amount cannot exceed the total amount");
  }
  return gst;
}

export function isPaymentSource(value: unknown): value is PaymentSource {
  return typeof value === "string" && (PAYMENT_SOURCES as string[]).includes(value);
}

export interface PaymentSplit {
  paymentSource: PaymentSource;
  /** Portion paid out of pocket, in the expense's own currency. */
  pocketAmount: number;
}

/**
 * The split rule shared by the forms and the API: the pocket share must be
 * more than 0 and less than the total, compared in paise so client and server
 * agree on float noise. Returns a user-facing message, or `null` when valid.
 */
export function getPaymentSplitError(
  amount: number | string,
  rawPocket: unknown
): string | null {
  if (rawPocket === null || rawPocket === undefined || String(rawPocket).trim() === "") {
    return "Enter the amount paid from pocket for a split payment";
  }
  const pocket = Number(rawPocket);
  if (!Number.isFinite(pocket)) return "Pocket amount must be a valid number";

  const pocketCents = moneyToCents(pocket);
  if (pocketCents <= 0 || pocketCents >= moneyToCents(amount)) {
    return "Pocket amount must be more than 0 and less than the total amount";
  }
  return null;
}

/**
 * Resolves who paid an expense of `amount`. `pocket` and `company` pin the
 * pocket portion to the whole amount or zero. `split` needs a pocket amount
 * strictly between 0 and the total; the company share is always derived as
 * `amount - pocketAmount`, so the two parts sum exactly to the total.
 *
 * Unlike GST, an out-of-range pocket amount is rejected rather than clamped:
 * it is money owed to a person, so it must never change silently.
 */
export function normalizePaymentSplit(
  source: unknown,
  rawPocket: unknown,
  amount: number
): PaymentSplit {
  const paymentSource = source === undefined || source === null ? "pocket" : source;
  if (!isPaymentSource(paymentSource)) {
    throw new Error("Payment source must be pocket, company or split");
  }
  if (paymentSource === "pocket") return { paymentSource, pocketAmount: amount };
  if (paymentSource === "company") return { paymentSource, pocketAmount: 0 };

  const error = getPaymentSplitError(amount, rawPocket);
  if (error) throw new Error(error);
  return { paymentSource, pocketAmount: roundMoney(Number(rawPocket)) };
}

/**
 * Converts the pocket portion to base currency at the expense's rate. Whole
 * pocket/company payments reuse the base total exactly. Rounding is monotonic,
 * so a split share never exceeds the base total; in a very low-rate currency
 * one side can round to 0 in base, which is accepted.
 */
export function pocketAmountInBase(
  split: PaymentSplit,
  amountInBaseCurrency: number,
  rateToBase: number
): number {
  if (split.paymentSource === "pocket") return amountInBaseCurrency;
  if (split.paymentSource === "company") return 0;
  return roundMoney(split.pocketAmount * rateToBase);
}

// Mongo aggregation expressions for the base-currency split of each expense.
// Legacy docs have no pocketAmountInBaseCurrency: anything not paid by the
// company counts wholly as pocket, matching how they were bucketed before.
export const baseTotalExpr = { $ifNull: ["$amountInBaseCurrency", "$amount"] };

export const pocketBaseExpr = {
  $ifNull: [
    "$pocketAmountInBaseCurrency",
    { $cond: [{ $eq: ["$paymentSource", "company"] }, 0, baseTotalExpr] },
  ],
};

export const companyBaseExpr = { $subtract: [baseTotalExpr, pocketBaseExpr] };

export interface PaymentSplitFields {
  amount: number;
  amountInBaseCurrency?: number | null;
  paymentSource?: string | null;
  pocketAmount?: number | null;
  pocketAmountInBaseCurrency?: number | null;
}

export interface PaymentBreakdown {
  pocket: number;
  company: number;
  pocketBase: number;
  companyBase: number;
}

/** Client-side counterpart of the aggregation expressions, for one expense. */
export function getPaymentBreakdown(expense: PaymentSplitFields): PaymentBreakdown {
  const amount = Number(expense.amount) || 0;
  const baseTotal = expense.amountInBaseCurrency ?? amount;
  const wholeToPocket = expense.paymentSource !== "company";
  const pocket = expense.pocketAmount ?? (wholeToPocket ? amount : 0);
  const pocketBase = expense.pocketAmountInBaseCurrency ?? (wholeToPocket ? baseTotal : 0);
  return {
    pocket,
    company: roundMoney(amount - pocket),
    pocketBase,
    companyBase: roundMoney(baseTotal - pocketBase),
  };
}
