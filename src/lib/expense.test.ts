import { describe, it, expect } from "vitest";
import { Aggregator } from "mingo";
import "mingo/init/system";
import {
  buildPaymentFields,
  companyBaseExpr,
  getPaymentBreakdown,
  getPaymentEntriesError,
  MAX_PAYMENT_ENTRIES,
  paymentEntriesEqual,
  paymentEntriesInBase,
  normalizeGstAmount,
  normalizePaymentSplit,
  pocketAmountInBase,
  pocketBaseExpr,
  spendByPayerPipeline,
} from "@/lib/expense";

describe("normalizeGstAmount", () => {
  it("returns null when GST is absent", () => {
    expect(normalizeGstAmount(null, 100)).toBeNull();
    expect(normalizeGstAmount(undefined, 100)).toBeNull();
    expect(normalizeGstAmount("", 100)).toBeNull();
  });

  it("accepts a valid GST that is a portion of the total", () => {
    expect(normalizeGstAmount(18, 118)).toBe(18);
    expect(normalizeGstAmount("18", 118)).toBe(18);
    expect(normalizeGstAmount(0, 100)).toBe(0);
  });

  it("accepts GST equal to the total", () => {
    expect(normalizeGstAmount(100, 100)).toBe(100);
  });

  it("rejects GST greater than the total", () => {
    expect(() => normalizeGstAmount(120, 100)).toThrow(/cannot exceed/i);
  });

  it("rejects negative or non-numeric GST", () => {
    expect(() => normalizeGstAmount(-5, 100)).toThrow(/non-negative/i);
    expect(() => normalizeGstAmount("abc", 100)).toThrow(/non-negative/i);
  });
});

describe("normalizePaymentSplit", () => {
  it("puts the whole amount on pocket or company for single-source payments", () => {
    expect(normalizePaymentSplit("pocket", undefined, 500)).toEqual({
      paymentSource: "pocket",
      pocketAmount: 500,
    });
    expect(normalizePaymentSplit("company", 200, 500)).toEqual({
      paymentSource: "company",
      pocketAmount: 0,
    });
  });

  it("defaults a missing source to pocket", () => {
    expect(normalizePaymentSplit(undefined, undefined, 80)).toEqual({
      paymentSource: "pocket",
      pocketAmount: 80,
    });
  });

  it("accepts a split pocket amount strictly inside the total", () => {
    expect(normalizePaymentSplit("split", "150.5", 500)).toEqual({
      paymentSource: "split",
      pocketAmount: 150.5,
    });
  });

  it("rounds the split pocket amount to paise", () => {
    expect(normalizePaymentSplit("split", 10.006, 50).pocketAmount).toBe(10.01);
  });

  it("rejects a split without a pocket amount", () => {
    expect(() => normalizePaymentSplit("split", undefined, 500)).toThrow(/enter the amount/i);
    expect(() => normalizePaymentSplit("split", "", 500)).toThrow(/enter the amount/i);
  });

  it("rejects a split pocket amount at or outside the bounds", () => {
    expect(() => normalizePaymentSplit("split", 0, 500)).toThrow(/more than 0/i);
    expect(() => normalizePaymentSplit("split", 500, 500)).toThrow(/less than the total/i);
    expect(() => normalizePaymentSplit("split", 600, 500)).toThrow(/less than the total/i);
    expect(() => normalizePaymentSplit("split", 499.999, 500)).toThrow(/less than the total/i);
  });

  it("rejects a stored split that no longer fits a lowered amount", () => {
    expect(() => normalizePaymentSplit("split", 300, 250)).toThrow(/less than the total/i);
  });

  it("rejects non-numeric pocket amounts and unknown or empty sources", () => {
    expect(() => normalizePaymentSplit("split", "abc", 500)).toThrow(/valid number/i);
    expect(() => normalizePaymentSplit("card", undefined, 500)).toThrow(/payment source/i);
    expect(() => normalizePaymentSplit("", undefined, 500)).toThrow(/payment source/i);
  });

  it("compares against the total in paise, like the forms do", () => {
    expect(() => normalizePaymentSplit("split", 100, 100.004)).toThrow(/less than the total/i);
  });
});

describe("pocketAmountInBase", () => {
  it("reuses the base total for pocket and zero for company", () => {
    expect(pocketAmountInBase({ paymentSource: "pocket", pocketAmount: 10 }, 833.33, 83.333)).toBe(
      833.33
    );
    expect(pocketAmountInBase({ paymentSource: "company", pocketAmount: 0 }, 833.33, 83.333)).toBe(0);
  });

  it("converts a split share at the expense rate", () => {
    expect(pocketAmountInBase({ paymentSource: "split", pocketAmount: 4 }, 833.33, 83.333)).toBe(
      333.33
    );
  });
});

describe("payment split aggregation expressions", () => {
  // Minimal evaluator for the operators these expressions use, so the Mongo
  // logic is checked against real documents rather than by shape alone.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function evaluate(expr: any, doc: Record<string, unknown>): any {
    if (typeof expr === "string" && expr.startsWith("$")) return doc[expr.slice(1)] ?? null;
    if (expr === null || typeof expr !== "object") return expr;
    if ("$ifNull" in expr) {
      const [value, fallback] = expr.$ifNull;
      return evaluate(value, doc) ?? evaluate(fallback, doc);
    }
    if ("$cond" in expr) {
      const [test, then, otherwise] = expr.$cond;
      return evaluate(test, doc) ? evaluate(then, doc) : evaluate(otherwise, doc);
    }
    if ("$eq" in expr) return evaluate(expr.$eq[0], doc) === evaluate(expr.$eq[1], doc);
    if ("$subtract" in expr) {
      const [a, b] = expr.$subtract.map((part: unknown) => evaluate(part, doc));
      return a === null || b === null ? null : a - b;
    }
    throw new Error(`Unsupported expression ${JSON.stringify(expr)}`);
  }

  const split = (doc: Record<string, unknown>) => ({
    pocket: evaluate(pocketBaseExpr, doc),
    company: evaluate(companyBaseExpr, doc),
  });

  it("splits a split expense by its stored pocket share", () => {
    expect(
      split({
        paymentSource: "split",
        amount: 10,
        amountInBaseCurrency: 830,
        pocketAmountInBaseCurrency: 249,
      })
    ).toEqual({ pocket: 249, company: 581 });
  });

  it("falls back for legacy documents without a pocket share", () => {
    expect(split({ paymentSource: "pocket", amount: 100, amountInBaseCurrency: 100 })).toEqual({
      pocket: 100,
      company: 0,
    });
    expect(split({ paymentSource: "company", amount: 100, amountInBaseCurrency: 100 })).toEqual({
      pocket: 0,
      company: 100,
    });
    expect(split({ amount: 70 })).toEqual({ pocket: 70, company: 0 });
  });
});

describe("getPaymentBreakdown", () => {
  it("returns both shares for a split expense", () => {
    expect(
      getPaymentBreakdown({
        amount: 1000,
        amountInBaseCurrency: 1000,
        paymentSource: "split",
        pocketAmount: 400,
        pocketAmountInBaseCurrency: 400,
      })
    ).toEqual({ pocket: 400, company: 600, pocketBase: 400, companyBase: 600 });
  });

  it("falls back for legacy single-source expenses", () => {
    expect(getPaymentBreakdown({ amount: 12, amountInBaseCurrency: 996, paymentSource: "company" })).toEqual(
      { pocket: 0, company: 12, pocketBase: 0, companyBase: 996 }
    );
    expect(getPaymentBreakdown({ amount: 50, paymentSource: "pocket" })).toEqual({
      pocket: 50,
      company: 0,
      pocketBase: 50,
      companyBase: 0,
    });
  });
});

describe("payments shared between people", () => {
  const asha = "66c1884c0853f8a76a4da201";
  const ravi = "66c1884c0853f8a76a4da202";

  it("accepts two or more payments that add up to the total", () => {
    expect(
      getPaymentEntriesError("1000", [
        { paidBy: asha, amount: "600", source: "pocket" },
        { paidBy: ravi, amount: 400, source: "company" },
      ])
    ).toBeNull();
  });

  it("lets one person pay part from pocket and part from the company", () => {
    expect(
      getPaymentEntriesError(100, [
        { paidBy: asha, amount: 30, source: "pocket" },
        { paidBy: asha, amount: 70, source: "company" },
      ])
    ).toBeNull();
  });

  it("rejects an invalid list of payments", () => {
    const valid = { paidBy: ravi, amount: 50, source: "pocket" };
    expect(getPaymentEntriesError(100, undefined)).toMatch(/at least two payments/i);
    expect(getPaymentEntriesError(100, [valid])).toMatch(/at least two payments/i);
    expect(getPaymentEntriesError(100, [{ ...valid, paidBy: "" }, valid])).toMatch(/choose who/i);
    expect(getPaymentEntriesError(100, [{ ...valid, paidBy: "nope" }, valid])).toMatch(/payer is invalid/i);
    expect(getPaymentEntriesError(100, [{ ...valid, source: "card" }, { ...valid, paidBy: asha }])).toMatch(
      /pocket or the company account/i
    );
    expect(getPaymentEntriesError(100, [valid, valid])).toMatch(/only one pocket and one company/i);
    expect(getPaymentEntriesError(100, [{ ...valid, amount: null }, { ...valid, paidBy: asha }])).toMatch(
      /enter an amount/i
    );
    expect(getPaymentEntriesError(100, [{ ...valid, amount: 0 }, { ...valid, paidBy: asha, amount: 100 }])).toMatch(
      /more than 0/i
    );
  });

  it("requires the payments to add up exactly to the total, compared in paise", () => {
    expect(
      getPaymentEntriesError("0.3", [
        { paidBy: asha, amount: 0.1, source: "pocket" },
        { paidBy: ravi, amount: 0.2, source: "pocket" },
      ])
    ).toBeNull();
    expect(
      getPaymentEntriesError(100, [
        { paidBy: asha, amount: 60, source: "pocket" },
        { paidBy: ravi, amount: 50, source: "pocket" },
      ])
    ).toBe("Payments add up to 110.00 but the total amount is 100.00");
  });

  it("normalizes the payments and sums the pocket entries", () => {
    expect(
      normalizePaymentSplit("multiple", 999, 100, [
        { paidBy: ` ${asha} `, amount: "20.004", source: "pocket" },
        { paidBy: ravi, amount: "30", source: "pocket" },
        { paidBy: asha, amount: 50, source: "company" },
      ])
    ).toEqual({
      paymentSource: "multiple",
      pocketAmount: 50,
      payments: [
        { paidBy: asha, amount: 20, source: "pocket" },
        { paidBy: ravi, amount: 30, source: "pocket" },
        { paidBy: asha, amount: 50, source: "company" },
      ],
    });
  });

  it("converts each part so the base amounts add up to the base total", () => {
    const parts = paymentEntriesInBase(
      [
        { paidBy: asha, amount: 0.01, source: "pocket" },
        { paidBy: ravi, amount: 0.01, source: "pocket" },
        { paidBy: asha, amount: 0.01, source: "company" },
      ],
      0.01,
      0.4
    );
    expect(parts.map((part) => part.amountInBaseCurrency)).toEqual([0, 0.01, 0]);
    expect(parts.every((part) => part.amountInBaseCurrency >= 0)).toBe(true);
  });

  it("builds the stored fields, clearing payers for other sources", () => {
    const split = normalizePaymentSplit("multiple", undefined, 100, [
      { paidBy: asha, amount: 40, source: "pocket" },
      { paidBy: ravi, amount: 60, source: "company" },
    ]);
    expect(buildPaymentFields(split, 8300, 83)).toEqual({
      paymentSource: "multiple",
      pocketAmount: 40,
      pocketAmountInBaseCurrency: 3320,
      payments: [
        { paidBy: asha, amount: 40, source: "pocket", amountInBaseCurrency: 3320 },
        { paidBy: ravi, amount: 60, source: "company", amountInBaseCurrency: 4980 },
      ],
    });
    expect(buildPaymentFields(normalizePaymentSplit("company", undefined, 100), 8300, 83)).toEqual({
      paymentSource: "company",
      pocketAmount: 0,
      pocketAmountInBaseCurrency: 0,
      payments: [],
    });
  });

  it("compares payment lists by payer, source and amount in paise", () => {
    const entries = [{ paidBy: asha, amount: 0.3, source: "pocket" as const }];
    expect(paymentEntriesEqual(entries, [{ ...entries[0], amount: 0.1 + 0.2 }])).toBe(true);
    expect(paymentEntriesEqual(entries, [{ ...entries[0], source: "company" }])).toBe(false);
    expect(paymentEntriesEqual(entries, [])).toBe(false);
  });

  it("caps the number of payments", () => {
    const payments = Array.from({ length: MAX_PAYMENT_ENTRIES + 1 }, (_, index) => ({
      paidBy: index.toString(16).padStart(24, "0"),
      amount: 1,
      source: "pocket",
    }));
    expect(getPaymentEntriesError(MAX_PAYMENT_ENTRIES + 1, payments)).toMatch(/at most 50 payments/i);
  });

  it("treats payer ids case-insensitively and stores them lowercased", () => {
    const upper = asha.toUpperCase();
    expect(
      getPaymentEntriesError(100, [
        { paidBy: upper, amount: 50, source: "pocket" },
        { paidBy: asha, amount: 50, source: "pocket" },
      ])
    ).toMatch(/only one pocket and one company/i);
    expect(
      normalizePaymentSplit("multiple", undefined, 100, [
        { paidBy: upper, amount: 50, source: "pocket" },
        { paidBy: ravi, amount: 50, source: "company" },
      ]).payments?.[0].paidBy
    ).toBe(asha);
  });

  it("ignores order and id case when comparing payment lists", () => {
    const stored = [
      { paidBy: asha, amount: 60, source: "pocket" as const },
      { paidBy: ravi, amount: 40, source: "company" as const },
    ];
    expect(paymentEntriesEqual([stored[1], { ...stored[0], paidBy: asha.toUpperCase() }], stored)).toBe(true);
  });
});

describe("spendByPayerPipeline", () => {
  it("credits each payer of a shared expense and the submitter of any other", () => {
    const expenses = [
      { createdBy: "A", amount: 100, amountInBaseCurrency: 100, paymentSource: "pocket", pocketAmountInBaseCurrency: 100, payments: [] },
      // Legacy doc: no pocket fields and no payments.
      { createdBy: "A", amount: 50, paymentSource: "company" },
      {
        createdBy: "A",
        amount: 100,
        amountInBaseCurrency: 100,
        paymentSource: "split",
        pocketAmountInBaseCurrency: 30,
        payments: [],
      },
      {
        createdBy: "A",
        amount: 100,
        amountInBaseCurrency: 100,
        paymentSource: "multiple",
        pocketAmountInBaseCurrency: 60,
        payments: [
          { paidBy: "B", amountInBaseCurrency: 60, source: "pocket" },
          { paidBy: "C", amountInBaseCurrency: 25, source: "company" },
          { paidBy: "B", amountInBaseCurrency: 15, source: "company" },
        ],
      },
    ];

    const rows = new Aggregator(spendByPayerPipeline).run(expenses) as {
      _id: string;
      totalSpend: number;
      pocketSpend: number;
      companySpend: number;
    }[];
    const byUser = Object.fromEntries(rows.map(({ _id, ...spend }) => [_id, spend]));

    expect(byUser).toEqual({
      A: { totalSpend: 250, pocketSpend: 130, companySpend: 120 },
      B: { totalSpend: 75, pocketSpend: 60, companySpend: 15 },
      C: { totalSpend: 25, pocketSpend: 0, companySpend: 25 },
    });
  });
});
