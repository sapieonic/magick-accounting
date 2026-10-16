import { moneyToCents, roundMoney } from "@/lib/asset";

// Kept here (not in the model) so client code can import it without mongoose.
export type PaymentSource = "pocket" | "company" | "split" | "multiple";

export const PAYMENT_SOURCES: PaymentSource[] = ["pocket", "company", "split", "multiple"];

/** Where one payer's part of a `multiple` payment came from. */
export type PaymentEntrySource = "pocket" | "company";

export const PAYMENT_ENTRY_SOURCES: PaymentEntrySource[] = ["pocket", "company"];

/** One person's part of an expense paid by several people, in the expense's currency. */
export interface PaymentEntry {
  paidBy: string;
  amount: number;
  source: PaymentEntrySource;
}

export interface PaymentEntryInBase extends PaymentEntry {
  amountInBaseCurrency: number;
}

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
  /** Each payer's part; only set for `multiple`. */
  payments?: PaymentEntry[];
}

const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;

/** Far more than any real invoice needs; keeps a bogus request from fanning out. */
export const MAX_PAYMENT_ENTRIES = 50;

/** Payer ids are compared and stored lowercased, matching how MongoDB prints ObjectIds. */
function normalizePayerId(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function formatMoney(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * The rule for an expense paid by several people, shared by the forms and the
 * API: at least two entries, each naming a payer, a pocket/company source and
 * an amount above 0, and the amounts adding up exactly to the total (compared
 * in paise). The same person may appear once per source, e.g. part from
 * pocket and part on a company card. Returns a user-facing message, or `null`.
 */
export function getPaymentEntriesError(amount: number | string, rawPayments: unknown): string | null {
  if (!Array.isArray(rawPayments) || rawPayments.length < 2) {
    return "Add at least two payments when several people paid";
  }
  if (rawPayments.length > MAX_PAYMENT_ENTRIES) {
    return `An expense can have at most ${MAX_PAYMENT_ENTRIES} payments`;
  }

  const seen = new Set<string>();
  let totalCents = 0;
  for (const raw of rawPayments) {
    const entry = (raw ?? {}) as Record<string, unknown>;
    const paidBy = normalizePayerId(entry.paidBy);
    if (!paidBy) return "Choose who made each payment";
    if (!OBJECT_ID_PATTERN.test(paidBy)) return "A payer is invalid";
    if (!(PAYMENT_ENTRY_SOURCES as unknown[]).includes(entry.source)) {
      return "Each payment must be from pocket or the company account";
    }
    const key = `${paidBy}:${entry.source}`;
    if (seen.has(key)) {
      return "Each person can have only one pocket and one company payment";
    }
    seen.add(key);

    if (entry.amount === null || entry.amount === undefined || String(entry.amount).trim() === "") {
      return "Enter an amount for each payment";
    }
    const value = Number(entry.amount);
    if (!Number.isFinite(value) || moneyToCents(value) <= 0) {
      return "Each payment amount must be more than 0";
    }
    totalCents += moneyToCents(value);
  }

  const amountCents = moneyToCents(amount);
  if (totalCents !== amountCents) {
    return `Payments add up to ${formatMoney(totalCents)} but the total amount is ${formatMoney(amountCents)}`;
  }
  return null;
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
 * `multiple` takes one entry per payer (see `getPaymentEntriesError`); its
 * pocket amount is the sum of the pocket entries.
 *
 * Unlike GST, an out-of-range pocket amount is rejected rather than clamped:
 * it is money owed to a person, so it must never change silently.
 */
export function normalizePaymentSplit(
  source: unknown,
  rawPocket: unknown,
  amount: number,
  rawPayments?: unknown
): PaymentSplit {
  const paymentSource = source === undefined || source === null ? "pocket" : source;
  if (!isPaymentSource(paymentSource)) {
    throw new Error("Payment source must be pocket, company, split or multiple");
  }
  if (paymentSource === "pocket") return { paymentSource, pocketAmount: amount };
  if (paymentSource === "company") return { paymentSource, pocketAmount: 0 };

  if (paymentSource === "multiple") {
    const error = getPaymentEntriesError(amount, rawPayments);
    if (error) throw new Error(error);
    const payments = (rawPayments as Record<string, unknown>[]).map((entry) => ({
      paidBy: normalizePayerId(entry.paidBy),
      amount: roundMoney(Number(entry.amount)),
      source: entry.source as PaymentEntrySource,
    }));
    const pocketCents = payments
      .filter((entry) => entry.source === "pocket")
      .reduce((total, entry) => total + moneyToCents(entry.amount), 0);
    return { paymentSource, pocketAmount: pocketCents / 100, payments };
  }

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
  if (split.paymentSource === "multiple") {
    const pocketCents = paymentEntriesInBase(split.payments ?? [], amountInBaseCurrency, rateToBase)
      .filter((entry) => entry.source === "pocket")
      .reduce((total, entry) => total + moneyToCents(entry.amountInBaseCurrency), 0);
    return pocketCents / 100;
  }
  return roundMoney(split.pocketAmount * rateToBase);
}

/** Same payers, sources and amounts (in paise), in any order. */
export function paymentEntriesEqual(a: PaymentEntry[], b: PaymentEntry[]): boolean {
  const keys = (entries: PaymentEntry[]) =>
    entries
      .map((entry) => `${normalizePayerId(entry.paidBy)}:${entry.source}:${moneyToCents(entry.amount)}`)
      .sort();
  const left = keys(a);
  const right = keys(b);
  return left.length === right.length && left.every((key, index) => key === right[index]);
}

/**
 * Converts each payer's part to base currency. Rounding the running total
 * (not each part) and taking differences keeps every part non-negative and
 * makes the parts add up exactly to `amountInBaseCurrency`.
 */
export function paymentEntriesInBase(
  payments: PaymentEntry[],
  amountInBaseCurrency: number,
  rateToBase: number
): PaymentEntryInBase[] {
  let runningCents = 0;
  let previousBaseCents = 0;
  return payments.map((entry, index) => {
    runningCents += moneyToCents(entry.amount);
    const baseCents =
      index === payments.length - 1
        ? moneyToCents(amountInBaseCurrency)
        : moneyToCents((runningCents / 100) * rateToBase);
    const amountInBase = (baseCents - previousBaseCents) / 100;
    previousBaseCents = baseCents;
    return { ...entry, amountInBaseCurrency: amountInBase };
  });
}

/**
 * The payment fields stored on an expense. Non-`multiple` expenses store an
 * empty `payments` list so switching away from `multiple` clears it.
 */
export function buildPaymentFields(
  split: PaymentSplit,
  amountInBaseCurrency: number,
  rateToBase: number
) {
  return {
    paymentSource: split.paymentSource,
    pocketAmount: split.pocketAmount,
    pocketAmountInBaseCurrency: pocketAmountInBase(split, amountInBaseCurrency, rateToBase),
    payments:
      split.paymentSource === "multiple"
        ? paymentEntriesInBase(split.payments ?? [], amountInBaseCurrency, rateToBase)
        : [],
  };
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

/**
 * Aggregation pipeline totalling base-currency spend per person. An expense
 * paid by several people counts each part against its payer; any other
 * expense counts wholly against whoever submitted it.
 */
export const spendByPayerPipeline = [
  {
    $project: {
      shares: {
        $cond: [
          { $gt: [{ $size: { $ifNull: ["$payments", []] } }, 0] },
          {
            $map: {
              input: "$payments",
              as: "payment",
              in: {
                user: "$$payment.paidBy",
                pocket: {
                  $cond: [{ $eq: ["$$payment.source", "pocket"] }, "$$payment.amountInBaseCurrency", 0],
                },
                company: {
                  $cond: [{ $eq: ["$$payment.source", "company"] }, "$$payment.amountInBaseCurrency", 0],
                },
              },
            },
          },
          [{ user: "$createdBy", pocket: pocketBaseExpr, company: companyBaseExpr }],
        ],
      },
    },
  },
  { $unwind: "$shares" },
  {
    $group: {
      _id: "$shares.user",
      totalSpend: { $sum: { $add: ["$shares.pocket", "$shares.company"] } },
      companySpend: { $sum: "$shares.company" },
      pocketSpend: { $sum: "$shares.pocket" },
    },
  },
];

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
