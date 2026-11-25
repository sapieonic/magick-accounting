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
/**
 * Most expenses one `GET /api/expenses` page returns (`limit` is capped to
 * it); the CSV export fetches pages of this size.
 */
export const MAX_EXPENSE_PAGE = 10000;

export const baseTotalExpr = { $ifNull: ["$amountInBaseCurrency", "$amount"] };

export const pocketBaseExpr = {
  $ifNull: [
    "$pocketAmountInBaseCurrency",
    { $cond: [{ $eq: ["$paymentSource", "company"] }, 0, baseTotalExpr] },
  ],
};

export const companyBaseExpr = { $subtract: [baseTotalExpr, pocketBaseExpr] };

// A "several people" expense with its payer list; anything else counts wholly
// against whoever submitted it. Shared by the spend pipeline and the payer
// filter so Spend by User always matches the expenses listed for that person.
const sharedPaymentExpr = {
  $and: [
    { $eq: ["$paymentSource", "multiple"] },
    { $gt: [{ $size: { $ifNull: ["$payments", []] } }, 0] },
  ],
};

/**
 * Aggregation stages that turn each expense into one `shares` document per
 * person it is credited to: `{ user, pocket, company }` in base currency.
 */
export const payerShareStages = [
  {
    $project: {
      shares: {
        $cond: [
          sharedPaymentExpr,
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
];

const shareTotals = {
  totalSpend: { $sum: { $add: ["$shares.pocket", "$shares.company"] } },
  companySpend: { $sum: "$shares.company" },
  pocketSpend: { $sum: "$shares.pocket" },
};

/** Aggregation pipeline totalling base-currency spend per person (see `payerShareStages`). */
export const spendByPayerPipeline = [
  ...payerShareStages,
  { $group: { _id: "$shares.user", ...shareTotals } },
];

/** Pipeline totalling one person's share of the expenses matching `filter`. */
export function payerSpendPipeline(filter: Record<string, unknown>, payerId: unknown) {
  return [
    { $match: filter },
    ...payerShareStages,
    { $match: { "shares.user": payerId } },
    { $group: { _id: null, ...shareTotals } },
  ];
}

/**
 * Aggregation expressions for one person's share of a single expense, in base
 * currency: `{ total, pocket, company }`. Same rule as `payerShareStages` (each
 * payer of a shared expense gets their own entries, the submitter gets
 * anything else in full), but as plain expressions, so they can be summed in a
 * `$group` without unwinding. A person who neither paid nor submitted gets 0.
 */
export function payerShareExprs(payerId: unknown) {
  const sharedEntries = (source: PaymentEntrySource) => ({
    $reduce: {
      input: {
        $filter: {
          input: { $ifNull: ["$payments", []] },
          as: "payment",
          cond: {
            $and: [{ $eq: ["$$payment.paidBy", payerId] }, { $eq: ["$$payment.source", source] }],
          },
        },
      },
      initialValue: 0,
      in: { $add: ["$$value", { $ifNull: ["$$this.amountInBaseCurrency", 0] }] },
    },
  });
  const ifSubmitter = (expr: unknown) => ({ $cond: [{ $eq: ["$createdBy", payerId] }, expr, 0] });
  const pocket = { $cond: [sharedPaymentExpr, sharedEntries("pocket"), ifSubmitter(pocketBaseExpr)] };
  const company = { $cond: [sharedPaymentExpr, sharedEntries("company"), ifSubmitter(companyBaseExpr)] };
  return { total: { $add: [pocket, company] }, pocket, company };
}

/** Whole-expense amounts in base currency, as `{ total, pocket, company }` expressions. */
export const wholeExpenseExprs = {
  total: baseTotalExpr,
  pocket: pocketBaseExpr,
  company: companyBaseExpr,
};

/**
 * Query for the expenses a `user`-role person may see: the ones they
 * submitted and the shared ones they paid part of. Every expense that counts
 * toward their spend (`paidByFilter`) is among them.
 */
export function visibleToUserFilter(userId: unknown): Record<string, unknown> {
  return {
    $or: [{ createdBy: userId }, { paymentSource: "multiple", "payments.paidBy": userId }],
  };
}

/**
 * Query matching the expenses credited to `payerId` by `payerShareStages`:
 * shared expenses listing them as a payer, and their other submissions.
 */
export function paidByFilter(payerId: unknown): Record<string, unknown> {
  const shared = { paymentSource: "multiple", "payments.0": { $exists: true } };
  return {
    $or: [
      { ...shared, "payments.paidBy": payerId },
      { createdBy: payerId, $nor: [shared] },
    ],
  };
}

/**
 * The rate an expense's amount was converted to base currency at: the stored
 * `exchangeRateToBase`, else (older documents) base amount / amount, as
 * `PUT /api/expenses/:id` derives it. `null` when neither is known.
 */
export function storedRateToBase(expense: {
  exchangeRateToBase?: number | null;
  amount: number;
  amountInBaseCurrency?: number | null;
}): number | null {
  if (expense.exchangeRateToBase) return expense.exchangeRateToBase;
  return expense.amount > 0 && expense.amountInBaseCurrency != null
    ? expense.amountInBaseCurrency / expense.amount
    : null;
}

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

/** An id, or a populated document's `_id`, as a string ("" when absent). */
function idString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "_id" in (value as Record<string, unknown>)) {
    const inner = (value as { _id: unknown })._id;
    // A Mongoose ObjectId's `_id` is the ObjectId itself.
    if (inner !== value) return idString(inner);
  }
  return String(value).toLowerCase();
}

/** The fields `payerShare` and the access checks read; ids may be raw or populated. */
export interface PayerShareFields extends PaymentSplitFields {
  payments?: { paidBy?: unknown; amountInBaseCurrency?: number | null; source?: string }[] | null;
  createdBy?: unknown;
}

/** A shared ("several people") expense with its payer list, as `sharedPaymentExpr` reads it. */
function sharedPayments(expense: PayerShareFields) {
  return expense.paymentSource === "multiple" ? expense.payments ?? [] : [];
}

/**
 * The part of an expense credited to `payerId` in base currency, by the
 * server's rule (`payerShareStages` / `payerShareExprs`): a "several people"
 * expense credits each payer's own entries, anything else counts wholly to its
 * submitter. Works on listed (populated) and raw documents alike. Sums in
 * paise, so the result is exact to the paisa.
 */
export function payerShare(expense: PayerShareFields, payerId: string): { pocket: number; company: number } {
  const payer = idString(payerId);
  const payments = sharedPayments(expense);
  if (payments.length > 0) {
    let pocketCents = 0;
    let companyCents = 0;
    for (const entry of payments) {
      if (!payer || idString(entry.paidBy) !== payer) continue;
      const cents = moneyToCents(entry.amountInBaseCurrency ?? 0);
      if (entry.source === "pocket") pocketCents += cents;
      else if (entry.source === "company") companyCents += cents;
    }
    return { pocket: pocketCents / 100, company: companyCents / 100 };
  }
  if (!payer || idString(expense.createdBy) !== payer) return { pocket: 0, company: 0 };
  const { pocketBase, companyBase } = getPaymentBreakdown(expense);
  return { pocket: pocketBase, company: companyBase };
}

/** Who is looking at money figures: admins see whole expenses, anyone else their own share. */
export interface SpendViewer {
  _id: string;
  role: "master_admin" | "admin" | "user";
}

export function isAdminViewer(viewer: Pick<SpendViewer, "role">): boolean {
  return viewer.role === "admin" || viewer.role === "master_admin";
}

/**
 * The amounts of one expense as `viewer` counts them, in base currency:
 * the whole expense for an admin, their own share (`payerShare`) for anyone
 * else. Client-side counterpart of `spendExprs` in `expense-query.ts`.
 */
export function viewerAmounts(
  expense: PayerShareFields,
  viewer: SpendViewer
): { total: number; pocket: number; company: number } {
  const { pocket, company } = isAdminViewer(viewer)
    ? (({ pocketBase, companyBase }) => ({ pocket: pocketBase, company: companyBase }))(getPaymentBreakdown(expense))
    : payerShare(expense, viewer._id);
  return { total: (moneyToCents(pocket) + moneyToCents(company)) / 100, pocket, company };
}

/** Whether `viewer` may open an expense: admins all, others theirs and shared ones they paid part of. */
export function canViewExpense(expense: PayerShareFields, viewer: SpendViewer): boolean {
  if (canModifyExpense(expense, viewer)) return true;
  const me = idString(viewer._id);
  // A blank id must never match a missing (deleted) payer.
  return me !== "" && sharedPayments(expense).some((entry) => idString(entry.paidBy) === me);
}

/** Whether `viewer` may edit or delete an expense: admins all, others only what they submitted. */
export function canModifyExpense(expense: Pick<PayerShareFields, "createdBy">, viewer: SpendViewer): boolean {
  return isAdminViewer(viewer) || (idString(viewer._id) !== "" && idString(expense.createdBy) === idString(viewer._id));
}
