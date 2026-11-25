import { describe, it, expect } from "vitest";
import { Aggregator, Query } from "mingo";
import "mingo/init/system";
import mongoose from "mongoose";
import { moneyToCents, roundMoney } from "@/lib/asset";
import {
  buildPaymentFields,
  canModifyExpense,
  canViewExpense,
  companyBaseExpr,
  getPaymentBreakdown,
  getPaymentEntriesError,
  MAX_PAYMENT_ENTRIES,
  paymentEntriesEqual,
  paymentEntriesInBase,
  normalizeGstAmount,
  normalizePaymentSplit,
  paidByFilter,
  payerShare,
  payerShareExprs,
  payerShareStages,
  payerSpendPipeline,
  pocketAmountInBase,
  pocketBaseExpr,
  spendByPayerPipeline,
  storedRateToBase,
  viewerAmounts,
  visibleToUserFilter,
  wholeExpenseExprs,
  type PayerShareFields,
  type PaymentSource,
  type SpendViewer,
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

describe("paidByFilter", () => {
  const expenses = [
    { _id: 1, createdBy: "A", amount: 100, amountInBaseCurrency: 100, paymentSource: "pocket", pocketAmountInBaseCurrency: 100, payments: [] },
    { _id: 2, createdBy: "A", amount: 50, paymentSource: "company" },
    {
      _id: 3,
      createdBy: "A",
      amount: 100,
      amountInBaseCurrency: 100,
      paymentSource: "multiple",
      pocketAmountInBaseCurrency: 60,
      payments: [
        { paidBy: "B", amountInBaseCurrency: 60, source: "pocket" },
        { paidBy: "C", amountInBaseCurrency: 40, source: "company" },
      ],
    },
    // A stray payer list on a single-source expense still counts for its submitter.
    {
      _id: 4,
      createdBy: "C",
      amount: 80,
      amountInBaseCurrency: 80,
      paymentSource: "pocket",
      pocketAmountInBaseCurrency: 80,
      payments: [{ paidBy: "B", amountInBaseCurrency: 80, source: "pocket" }],
    },
    // A shared expense that lost its payer list falls back to its submitter.
    { _id: 5, createdBy: "B", amount: 20, amountInBaseCurrency: 20, paymentSource: "multiple", pocketAmountInBaseCurrency: 20, payments: [] },
  ];

  it("doesn't move a single-source expense with a stray payer list off its submitter", () => {
    const rows = new Aggregator(spendByPayerPipeline).run(expenses) as { _id: string; totalSpend: number }[];
    expect(Object.fromEntries(rows.map((row) => [row._id, row.totalSpend]))).toEqual({ A: 150, B: 80, C: 120 });
  });

  it.each(["A", "B", "C"])("lists exactly the expenses Spend by User credits to %s", (person) => {
    const listed = new Query(paidByFilter(person))
      .find(expenses)
      .all()
      .map((expense) => (expense as { _id: number })._id)
      .sort();
    const credited = (
      new Aggregator([...spendByPayerPipeline.slice(0, -1), { $match: { "shares.user": person } }]).run(
        expenses
      ) as { _id: number }[]
    )
      .map((row) => row._id)
      .sort();
    expect(listed).toEqual([...new Set(credited)]);

    const [ownShare] = new Aggregator(payerSpendPipeline(paidByFilter(person), person)).run(expenses);
    const [spendRow] = (new Aggregator(spendByPayerPipeline).run(expenses) as { _id: string }[]).filter(
      (row) => row._id === person
    );
    expect(ownShare).toEqual({ ...spendRow, _id: null });
  });
});

describe("payerShare", () => {
  const asha = { _id: "asha", name: "Asha" };
  const ravi = { _id: "ravi", name: "Ravi" };

  it("credits each payer of a shared bill their own entries", () => {
    const shared = {
      amount: 100,
      amountInBaseCurrency: 8300,
      paymentSource: "multiple",
      pocketAmount: 60,
      pocketAmountInBaseCurrency: 4980,
      createdBy: asha,
      payments: [
        { paidBy: asha, amount: 60, amountInBaseCurrency: 4980, source: "pocket" },
        { paidBy: ravi, amount: 30, amountInBaseCurrency: 2490, source: "company" },
        { paidBy: ravi, amount: 10, amountInBaseCurrency: 830, source: "pocket" },
      ],
    };

    expect(payerShare(shared, "asha")).toEqual({ pocket: 4980, company: 0 });
    expect(payerShare(shared, "ravi")).toEqual({ pocket: 830, company: 2490 });
    expect(payerShare(shared, "someone-else")).toEqual({ pocket: 0, company: 0 });
  });

  it("credits anything else wholly to its submitter", () => {
    const split = {
      amount: 100,
      amountInBaseCurrency: 100,
      paymentSource: "split",
      pocketAmount: 30,
      pocketAmountInBaseCurrency: 30,
      createdBy: asha,
    };

    expect(payerShare(split, "asha")).toEqual({ pocket: 30, company: 70 });
    expect(payerShare(split, "ravi")).toEqual({ pocket: 0, company: 0 });
    // A "multiple" bill without entries falls back to the submitter, like the pipeline.
    expect(payerShare({ ...split, paymentSource: "multiple", payments: [] }, "asha")).toEqual({ pocket: 30, company: 70 });
  });

  it("skips entries whose payer was deleted", () => {
    const shared = {
      amount: 10,
      paymentSource: "multiple",
      createdBy: asha,
      payments: [
        { paidBy: null, amount: 4, amountInBaseCurrency: 4, source: "pocket" },
        { paidBy: asha, amount: 6, amountInBaseCurrency: 6, source: "company" },
      ],
    };

    expect(payerShare(shared, "asha")).toEqual({ pocket: 0, company: 6 });
  });
});

describe("storedRateToBase", () => {
  it("uses the rate stored on entry over the rounded base amount", () => {
    expect(storedRateToBase({ amount: 0.07, amountInBaseCurrency: 5.84, exchangeRateToBase: 83.4567 })).toBe(83.4567);
  });

  it("derives the rate of older documents from their base amount", () => {
    expect(storedRateToBase({ amount: 100, amountInBaseCurrency: 8350 })).toBe(83.5);
    expect(storedRateToBase({ amount: 100, amountInBaseCurrency: 8350, exchangeRateToBase: null })).toBe(83.5);
  });

  it("is null when the rate can't be known", () => {
    expect(storedRateToBase({ amount: 0, amountInBaseCurrency: 0 })).toBeNull();
    expect(storedRateToBase({ amount: 100, amountInBaseCurrency: null })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Edge cases for the crediting rule: every implementation (unwind pipeline,
// per-payer expressions, filters and client mirrors over raw, populated and
// serialized documents) must give each person the same paise.

describe("payer crediting — every implementation agrees on edge cases", () => {
  type Doc = Record<string, unknown>;
  type Paise = { total: number; pocket: number; company: number };
  type Rupees = { pocket: number; company: number };

  const oid = (hex: string) => new mongoose.Types.ObjectId(hex);
  const A = oid("66c1884c0853f8a76a4da0a1");
  const B = oid("66c1884c0853f8a76a4da0a2");
  const C = oid("66c1884c0853f8a76a4da0a3");
  const D = oid("66c1884c0853f8a76a4da0a4");
  // A user who has since been deleted: raw docs keep the id, populate gives null.
  const GONE = oid("66c1884c0853f8a76a4da0ee");
  const PEOPLE = [A, B, C, D];
  const ADMIN: SpendViewer = { _id: "66c1884c0853f8a76a4da0ff", role: "admin" };
  const user = (id: string): SpendViewer => ({ _id: id, role: "user" });

  let nextId = 0;
  const newId = () => oid((0xe000 + (nextId += 1)).toString(16).padStart(24, "0"));

  /** Stores an expense the way POST /api/expenses does (ids cast to ObjectIds). */
  function store(input: {
    createdBy: mongoose.Types.ObjectId;
    amount: number;
    rate?: number;
    source: PaymentSource;
    pocket?: number;
    payments?: { paidBy: string; amount: number; source: "pocket" | "company" }[];
  }): Doc {
    const rate = input.rate ?? 1;
    const split = normalizePaymentSplit(input.source, input.pocket, input.amount, input.payments);
    const amountInBaseCurrency = roundMoney(input.amount * rate);
    const fields = buildPaymentFields(split, amountInBaseCurrency, rate);
    return {
      _id: newId(),
      createdBy: input.createdBy,
      amount: input.amount,
      amountInBaseCurrency,
      exchangeRateToBase: rate,
      ...fields,
      payments: fields.payments.map((entry) => ({ ...entry, paidBy: oid(entry.paidBy) })),
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aggregate = (pipeline: unknown[], docs: Doc[]) => new Aggregator(pipeline as any[]).run(docs) as any[];
  const paise = (money: { total?: number; pocket: number; company: number }): Paise => ({
    total: moneyToCents(money.total ?? money.pocket + money.company),
    pocket: moneyToCents(money.pocket),
    company: moneyToCents(money.company),
  });
  const ZERO: Paise = { total: 0, pocket: 0, company: 0 };

  /** The ways a client or server holds the same expense. */
  function forms(doc: Doc): [string, PayerShareFields][] {
    const ref = (id: unknown) =>
      id == null || String(id) === String(GONE) ? null : { _id: id, name: "Someone" };
    const populated = {
      ...doc,
      createdBy: ref(doc.createdBy),
      payments: Array.isArray(doc.payments)
        ? (doc.payments as Doc[]).map((entry) => ({ ...entry, paidBy: ref(entry.paidBy) }))
        : doc.payments,
    };
    // What the API's JSON looks like once the browser parses it.
    const json = JSON.parse(JSON.stringify(populated));
    // Same ids, uppercased (ids are case-insensitive hex).
    const shout = JSON.parse(JSON.stringify(populated).replace(/[0-9a-f]{24}/g, (hex) => hex.toUpperCase()));
    return [
      ["raw", doc as PayerShareFields],
      ["populated", populated as PayerShareFields],
      ["json", json],
      ["uppercase json", shout],
    ];
  }

  /** One person's share by every implementation, in paise. */
  function sharesOf(doc: Doc, person: mongoose.Types.ObjectId): Record<string, Paise> {
    const id = String(person);
    const out: Record<string, Paise> = {};

    const row = aggregate(spendByPayerPipeline, [doc]).find((r) => String(r._id) === id);
    out.spendByPayerPipeline = row ? paise({ total: row.totalSpend, pocket: row.pocketSpend, company: row.companySpend }) : ZERO;

    const [paid] = aggregate(payerSpendPipeline(paidByFilter(person), person), [doc]);
    out.payerSpendPipeline = paid ? paise({ total: paid.totalSpend, pocket: paid.pocketSpend, company: paid.companySpend }) : ZERO;

    const exprs = payerShareExprs(person);
    const [direct] = aggregate(
      [{ $group: { _id: null, total: { $sum: exprs.total }, pocket: { $sum: exprs.pocket }, company: { $sum: exprs.company } } }],
      [doc]
    );
    out.payerShareExprs = paise(direct);

    for (const [name, form] of forms(doc)) {
      // A deleted payer can't be looked up by the client, and is never a viewer.
      if (person === GONE && name !== "raw") continue;
      for (const viewerId of [id, id.toUpperCase()]) {
        out[`payerShare(${name}, ${viewerId === id ? "lower" : "upper"})`] = paise(payerShare(form, viewerId));
        out[`viewerAmounts(${name}, ${viewerId === id ? "lower" : "upper"})`] = paise(viewerAmounts(form, user(viewerId)));
      }
    }
    return out;
  }

  /**
   * Checks every implementation against the expected shares and access.
   * `expected` maps a person to their share in rupees; anyone missing gets 0.
   */
  function expectAgreement(
    doc: Doc,
    expected: { shares: Map<mongoose.Types.ObjectId, Rupees>; visible: mongoose.Types.ObjectId[] }
  ) {
    for (const person of PEOPLE) {
      const want = paise(expected.shares.get(person) ?? { pocket: 0, company: 0 });
      const got = sharesOf(doc, person);
      for (const [impl, value] of Object.entries(got)) {
        expect({ person: String(person), impl, value }).toEqual({ person: String(person), impl, value: want });
      }

      const id = String(person);
      const shouldSee = expected.visible.includes(person);
      const submitted = String(doc.createdBy) === id;
      expect({ person: id, visibleToUserFilter: new Query(visibleToUserFilter(person)).test(doc) }).toEqual({
        person: id,
        visibleToUserFilter: shouldSee,
      });
      for (const [name, form] of forms(doc)) {
        for (const viewerId of [id, id.toUpperCase()]) {
          expect({ person: id, form: name, viewerId, view: canViewExpense(form, user(viewerId)) }).toEqual({
            person: id,
            form: name,
            viewerId,
            view: shouldSee,
          });
          expect({ person: id, form: name, viewerId, modify: canModifyExpense(form, user(viewerId)) }).toEqual({
            person: id,
            form: name,
            viewerId,
            modify: submitted,
          });
        }
      }

      // Anyone the pipeline credits (even with 0) is listed by paidByFilter and can see it.
      const credited = aggregate([...payerShareStages, { $match: { "shares.user": person } }], [doc]).length > 0;
      expect({ person: id, paidByFilter: new Query(paidByFilter(person)).test(doc) }).toEqual({
        person: id,
        paidByFilter: credited,
      });
      if (credited) expect(shouldSee).toBe(true);
    }

    // Nobody negative, and the people's shares (deleted payers included) add up to the expense.
    const baseCents = moneyToCents((doc.amountInBaseCurrency as number | null | undefined) ?? (doc.amount as number));
    const rows = aggregate(spendByPayerPipeline, [doc]).map((row) =>
      paise({ total: row.totalSpend, pocket: row.pocketSpend, company: row.companySpend })
    );
    for (const row of rows) {
      expect(row.pocket).toBeGreaterThanOrEqual(0);
      expect(row.company).toBeGreaterThanOrEqual(0);
      expect(row.total).toBe(row.pocket + row.company);
    }
    const [whole] = aggregate(
      [{ $project: { total: wholeExpenseExprs.total, pocket: wholeExpenseExprs.pocket, company: wholeExpenseExprs.company } }],
      [doc]
    );
    expect(rows.reduce((sum, row) => sum + row.total, 0)).toBe(baseCents);
    expect(rows.reduce((sum, row) => sum + row.pocket, 0)).toBe(moneyToCents(whole.pocket));
    expect(rows.reduce((sum, row) => sum + row.company, 0)).toBe(moneyToCents(whole.company));

    // Admins see the whole expense in every form, and can open and change it.
    for (const [name, form] of forms(doc)) {
      expect({ form: name, admin: paise(viewerAmounts(form, ADMIN)) }).toEqual({
        form: name,
        admin: { total: baseCents, pocket: moneyToCents(whole.pocket), company: moneyToCents(whole.company) },
      });
      expect(canViewExpense(form, ADMIN)).toBe(true);
      expect(canModifyExpense(form, ADMIN)).toBe(true);
    }
  }

  const shares = (...entries: [mongoose.Types.ObjectId, Rupees][]) => new Map(entries);

  // A submits $100 at ₹83.47 that B and C paid; B paid twice (pocket and the
  // company card), A paid nothing. Running total rounded then differenced:
  // 2,782.06 / 2,782.05 / 2,782.89 = 8,347.00.
  const payerTwice = store({
    createdBy: A,
    amount: 100,
    rate: 83.47,
    source: "multiple",
    payments: [
      { paidBy: String(B).toUpperCase(), amount: 33.33, source: "pocket" },
      { paidBy: String(C), amount: 33.33, source: "company" },
      { paidBy: String(B), amount: 33.34, source: "company" },
    ],
  });

  it("stores a payer who paid from pocket and the company card under one lowercased id", () => {
    expect(payerTwice).toEqual(
      expect.objectContaining({
        amountInBaseCurrency: 8347,
        pocketAmount: 33.33,
        pocketAmountInBaseCurrency: 2782.06,
        payments: [
          { paidBy: B, amount: 33.33, source: "pocket", amountInBaseCurrency: 2782.06 },
          { paidBy: C, amount: 33.33, source: "company", amountInBaseCurrency: 2782.05 },
          { paidBy: B, amount: 33.34, source: "company", amountInBaseCurrency: 2782.89 },
        ],
      })
    );
  });

  it("sums both of one payer's entries; a submitter who paid nothing gets 0 but can still view and edit", () => {
    expectAgreement(payerTwice, {
      shares: shares([B, { pocket: 2782.06, company: 2782.89 }], [C, { pocket: 0, company: 2782.05 }]),
      visible: [A, B, C],
    });
  });

  it("credits a submitter who paid both sides of a shared bill, in a repeating-decimal currency", () => {
    // ₹1,000.01 × 3.3333333 = ₹3,333.37: A ₹0.03 pocket + ₹1,666.67 company, B ₹1,666.67 pocket.
    const doc = store({
      createdBy: A,
      amount: 1000.01,
      rate: 3.3333333,
      source: "multiple",
      payments: [
        { paidBy: String(A), amount: 0.01, source: "pocket" },
        { paidBy: String(B), amount: 500, source: "pocket" },
        { paidBy: String(A).toUpperCase(), amount: 500, source: "company" },
      ],
    });
    expect(doc.amountInBaseCurrency).toBe(3333.37);
    expect(doc.pocketAmountInBaseCurrency).toBe(1666.7);
    expectAgreement(doc, {
      shares: shares([A, { pocket: 0.03, company: 1666.67 }], [B, { pocket: 1666.67, company: 0 }]),
      visible: [A, B],
    });
  });

  describe("a 'several people' expense without a payer list falls back to its submitter", () => {
    const base = {
      createdBy: A,
      amount: 100,
      amountInBaseCurrency: 8347,
      paymentSource: "multiple",
      pocketAmount: 60,
      pocketAmountInBaseCurrency: 5008.2,
    };
    it.each([
      ["empty", { payments: [] }],
      ["missing", {}],
      ["null", { payments: null }],
    ])("payments %s", (_label, payments) => {
      expectAgreement(
        { _id: newId(), ...base, ...payments },
        { shares: shares([A, { pocket: 5008.2, company: 3338.8 }]), visible: [A] }
      );
    });

    it("without pocket fields either, counts wholly as pocket", () => {
      expectAgreement(
        { _id: newId(), createdBy: A, amount: 12.34, paymentSource: "multiple" },
        { shares: shares([A, { pocket: 12.34, company: 0 }]), visible: [A] }
      );
    });
  });

  describe("a stray payer list on a single-source expense is ignored everywhere", () => {
    const stray = [
      { paidBy: B, amount: 6, amountInBaseCurrency: 6, source: "pocket" },
      { paidBy: D, amount: 4, amountInBaseCurrency: 4, source: "company" },
    ];
    it.each([
      ["split", { pocketAmount: 4, pocketAmountInBaseCurrency: 4 }, { pocket: 4, company: 6 }],
      ["pocket", { pocketAmount: 10, pocketAmountInBaseCurrency: 10 }, { pocket: 10, company: 0 }],
      ["company", { pocketAmount: 0, pocketAmountInBaseCurrency: 0 }, { pocket: 0, company: 10 }],
      ["legacy (no source)", {}, { pocket: 10, company: 0 }],
    ] as const)("%s", (source, fields, share) => {
      const doc: Doc = {
        _id: newId(),
        createdBy: C,
        amount: 10,
        amountInBaseCurrency: 10,
        ...(source.startsWith("legacy") ? {} : { paymentSource: source }),
        ...fields,
        payments: stray,
      };
      // B and D are listed as payers but must neither be credited nor see it.
      expectAgreement(doc, { shares: shares([C, share]), visible: [C] });
    });
  });

  describe("legacy documents", () => {
    it.each([
      ["no source, no base, no pocket fields", { amount: 250 }, { pocket: 250, company: 0 }],
      ["company, no base", { amount: 99.99, paymentSource: "company" }, { pocket: 0, company: 99.99 }],
      ["null source with a base amount", { amount: 10, amountInBaseCurrency: 830, paymentSource: null }, { pocket: 830, company: 0 }],
      [
        "null base and pocket fields",
        { amount: 12.34, amountInBaseCurrency: null, paymentSource: "pocket", pocketAmountInBaseCurrency: null },
        { pocket: 12.34, company: 0 },
      ],
      ["split without a pocket share", { amount: 50, amountInBaseCurrency: 4150, paymentSource: "split" }, { pocket: 4150, company: 0 }],
      [
        "company with a base amount, no pocket fields",
        { amount: 12, amountInBaseCurrency: 996, paymentSource: "company" },
        { pocket: 0, company: 996 },
      ],
    ] as const)("%s", (_label, fields, share) => {
      expectAgreement({ _id: newId(), createdBy: B, ...fields }, { shares: shares([B, share]), visible: [B] });
    });
  });

  describe("tiny-rate currencies", () => {
    it("credits a ₹0.01 bill to exactly one payer; the others get 0 but still see it", () => {
      // ₹100 × 0.0001 = ₹0.01. Running totals 0.004 → 0, 0.007 → 0.01, 0.01.
      const doc = store({
        createdBy: D,
        amount: 100,
        rate: 0.0001,
        source: "multiple",
        payments: [
          { paidBy: String(A), amount: 40, source: "pocket" },
          { paidBy: String(B), amount: 30, source: "pocket" },
          { paidBy: String(C), amount: 30, source: "company" },
        ],
      });
      expect((doc.payments as { amountInBaseCurrency: number }[]).map((p) => p.amountInBaseCurrency)).toEqual([0, 0.01, 0]);
      expect(doc.pocketAmountInBaseCurrency).toBe(0.01);
      expectAgreement(doc, { shares: shares([B, { pocket: 0.01, company: 0 }]), visible: [A, B, C, D] });
    });

    it("rounds a whole shared bill to ₹0 without anyone going negative", () => {
      const doc = store({
        createdBy: C,
        amount: 3,
        rate: 0.0001,
        source: "multiple",
        payments: [
          { paidBy: String(A), amount: 1, source: "pocket" },
          { paidBy: String(B), amount: 2, source: "company" },
        ],
      });
      expect(doc).toEqual(expect.objectContaining({ amountInBaseCurrency: 0, pocketAmount: 1, pocketAmountInBaseCurrency: 0 }));
      expectAgreement(doc, { shares: shares(), visible: [A, B, C] });
    });

    it("splits a single-source bill whose pocket share rounds to ₹0", () => {
      // ₹10 × 0.0012 = ₹0.01; ₹4 from pocket = ₹0.0048 → ₹0.00, company ₹0.01.
      const doc = store({ createdBy: A, amount: 10, rate: 0.0012, source: "split", pocket: 4 });
      expect(doc).toEqual(expect.objectContaining({ amountInBaseCurrency: 0.01, pocketAmountInBaseCurrency: 0 }));
      expectAgreement(doc, { shares: shares([A, { pocket: 0, company: 0.01 }]), visible: [A] });
    });
  });

  it("keeps a zero-amount expense with its submitter", () => {
    const doc = store({ createdBy: C, amount: 0, source: "pocket" });
    expectAgreement(doc, { shares: shares([C, { pocket: 0, company: 0 }]), visible: [C] });
    const [row] = aggregate(spendByPayerPipeline, [doc]);
    expect(row).toEqual({ _id: C, totalSpend: 0, pocketSpend: 0, companySpend: 0 });
  });

  it("leaves a deleted payer's part off everyone else", () => {
    // One payer reference is null in the database, another points at a deleted user.
    const doc: Doc = {
      _id: newId(),
      createdBy: A,
      amount: 100,
      amountInBaseCurrency: 100,
      paymentSource: "multiple",
      pocketAmount: 30,
      pocketAmountInBaseCurrency: 30,
      payments: [
        { paidBy: null, amount: 30, amountInBaseCurrency: 30, source: "pocket" },
        { paidBy: GONE, amount: 50, amountInBaseCurrency: 50, source: "company" },
        { paidBy: B, amount: 20, amountInBaseCurrency: 20, source: "company" },
      ],
    };
    expectAgreement(doc, { shares: shares([B, { pocket: 0, company: 20 }]), visible: [A, B] });
    expect(paise(payerShare(doc as PayerShareFields, String(GONE)))).toEqual(paise({ pocket: 0, company: 50 }));
  });

  it("agrees across a whole ledger of these cases, and the visible list holds every credited rupee", () => {
    nextId = 500;
    const ledger: Doc[] = [
      payerTwice,
      store({
        createdBy: B,
        amount: 100,
        rate: 0.0001,
        source: "multiple",
        payments: [
          { paidBy: String(A), amount: 40, source: "pocket" },
          { paidBy: String(B), amount: 30, source: "pocket" },
          { paidBy: String(C), amount: 30, source: "company" },
        ],
      }),
      store({ createdBy: C, amount: 0, source: "company" }),
      store({ createdBy: D, amount: 12.5, rate: 91.2345, source: "split", pocket: 5 }),
      { _id: newId(), createdBy: A, amount: 20, amountInBaseCurrency: 20, paymentSource: "multiple", payments: [] },
      {
        _id: newId(),
        createdBy: C,
        amount: 10,
        amountInBaseCurrency: 10,
        paymentSource: "pocket",
        pocketAmountInBaseCurrency: 10,
        payments: [{ paidBy: D, amount: 10, amountInBaseCurrency: 10, source: "pocket" }],
      },
      { _id: newId(), createdBy: B, amount: 250 },
    ];
    const byUser = new Map(
      aggregate(spendByPayerPipeline, ledger).map((row) => [
        String(row._id),
        paise({ total: row.totalSpend, pocket: row.pocketSpend, company: row.companySpend }),
      ])
    );
    for (const person of PEOPLE) {
      const id = String(person);
      const mirror = { total: 0, pocket: 0, company: 0 };
      for (const doc of ledger) {
        const own = paise(viewerAmounts(doc as PayerShareFields, user(id)));
        mirror.total += own.total;
        mirror.pocket += own.pocket;
        mirror.company += own.company;
      }
      const exprs = payerShareExprs(person);
      const group = [
        { $group: { _id: null, total: { $sum: exprs.total }, pocket: { $sum: exprs.pocket }, company: { $sum: exprs.company } } },
      ];
      const [all] = aggregate(group, ledger);
      // The dashboard sums the expressions over only what the person can see.
      const visible = new Query(visibleToUserFilter(person)).find(ledger).all() as Doc[];
      const [seen] = visible.length ? aggregate(group, visible) : [{ total: 0, pocket: 0, company: 0 }];
      const [paid] = aggregate(payerSpendPipeline(paidByFilter(person), person), ledger);

      expect({ id, impl: "spendByPayerPipeline", v: byUser.get(id) ?? ZERO }).toEqual({ id, impl: "spendByPayerPipeline", v: mirror });
      expect({ id, impl: "payerShareExprs", v: paise(all) }).toEqual({ id, impl: "payerShareExprs", v: mirror });
      expect({ id, impl: "payerShareExprs over visible", v: paise(seen) }).toEqual({ id, impl: "payerShareExprs over visible", v: mirror });
      expect({ id, impl: "payerSpendPipeline", v: paid ? paise({ total: paid.totalSpend, pocket: paid.pocketSpend, company: paid.companySpend }) : ZERO }).toEqual({
        id,
        impl: "payerSpendPipeline",
        v: mirror,
      });
      expect(visible.map((doc) => String(doc._id))).toEqual(
        ledger.filter((doc) => canViewExpense(doc as PayerShareFields, user(id))).map((doc) => String(doc._id))
      );
    }
    // Spot-check the totals by hand: A ₹0 (payerTwice) + ₹0 (tiny) + ₹20 (empty list).
    expect(byUser.get(String(A))).toEqual(paise({ pocket: 20, company: 0 }));
    // D: euros ₹1,140.43 (₹456.17 pocket) + ₹0 for the stray entry on C's bill.
    expect(byUser.get(String(D))).toEqual(paise({ pocket: 456.17, company: 684.26 }));
  });

  describe("ids in every shape", () => {
    const hexA = String(A);
    const expense = (createdBy: unknown, payments: unknown[] = []) =>
      ({
        amount: 10,
        amountInBaseCurrency: 10,
        paymentSource: payments.length ? "multiple" : "pocket",
        pocketAmount: 10,
        pocketAmountInBaseCurrency: 10,
        createdBy,
        payments,
      }) as PayerShareFields;

    it.each([
      ["an ObjectId", A],
      ["a populated { _id: ObjectId }", { _id: A, name: "A" }],
      ["a populated { _id: string }", { _id: hexA, name: "A" }],
      ["an uppercase hex string", hexA.toUpperCase()],
      ["a populated { _id: uppercase string }", { _id: hexA.toUpperCase() }],
    ])("matches a submitter given as %s", (_label, createdBy) => {
      for (const viewerId of [hexA, hexA.toUpperCase()]) {
        expect(canModifyExpense(expense(createdBy), user(viewerId))).toBe(true);
        expect(canViewExpense(expense(createdBy), user(viewerId))).toBe(true);
        expect(payerShare(expense(createdBy), viewerId)).toEqual({ pocket: 10, company: 0 });
        expect(canModifyExpense(expense(createdBy), user(String(B)))).toBe(false);
        expect(canViewExpense(expense(createdBy), user(String(B)))).toBe(false);
        expect(payerShare(expense(createdBy), String(B))).toEqual({ pocket: 0, company: 0 });
      }
    });

    it.each([
      ["an ObjectId", A],
      ["a populated { _id: ObjectId }", { _id: A, name: "A" }],
      ["a populated { _id: string }", { _id: hexA }],
      ["an uppercase hex string", hexA.toUpperCase()],
    ])("matches a payer given as %s, who can view but not change it", (_label, paidBy) => {
      const doc = expense(B, [
        { paidBy, amountInBaseCurrency: 3.33, source: "pocket" },
        { paidBy: C, amountInBaseCurrency: 6.67, source: "company" },
      ]);
      expect(payerShare(doc, hexA.toUpperCase())).toEqual({ pocket: 3.33, company: 0 });
      expect(viewerAmounts(doc, user(hexA))).toEqual({ total: 3.33, pocket: 3.33, company: 0 });
      expect(canViewExpense(doc, user(hexA))).toBe(true);
      expect(canModifyExpense(doc, user(hexA))).toBe(false);
      expect(payerShare(doc, String(B))).toEqual({ pocket: 0, company: 0 });
      expect(canModifyExpense(doc, user(String(B)))).toBe(true);
    });

    // `canViewExpense` must match `visibleToUserFilter`, which never matches a
    // blank id against a null/missing reference.
    const otherPayer = { paidBy: C, amountInBaseCurrency: 6, source: "pocket" };
    it.each([
      ["null submitter", expense(null)],
      ["missing submitter", expense(undefined)],
      ["populated submitter with a null _id", expense({ _id: null })],
      ["null payer (deleted user, populated)", expense(B, [{ paidBy: null, amountInBaseCurrency: 4, source: "pocket" }, otherPayer])],
      ["missing payer", expense(B, [{ amountInBaseCurrency: 4, source: "pocket" }, otherPayer])],
      ["populated payer without an _id", expense(B, [{ paidBy: { _id: undefined }, amountInBaseCurrency: 4, source: "pocket" }, otherPayer])],
    ])("never lets a blank viewer id match a %s", (_label, doc) => {
      const blank = user("");
      // The server's filter for the same viewer matches nothing.
      expect(new Query(visibleToUserFilter("")).test(doc)).toBe(false);
      expect(canModifyExpense(doc, blank)).toBe(false);
      expect(canViewExpense(doc, blank)).toBe(false);
      expect(payerShare(doc, "")).toEqual({ pocket: 0, company: 0 });
      expect(viewerAmounts(doc, blank)).toEqual({ total: 0, pocket: 0, company: 0 });
    });
  });

  describe("write path at half-paisa totals and odd rates", () => {
    // Totals that aren't whole paise (e.g. 99.995) still pass validation when the
    // payments match in paise; every stored part must stay ≥ 0 and add up exactly.
    it.each([
      [99.995, 0.0001],
      [99.995, 83.47],
      [0.035, 0.5],
      [1000.004, 3.3333333],
      [0.03, 0.4],
      [123456.785, 0.0123],
    ])("total %s at rate %s", (amount, rate) => {
      const totalCents = moneyToCents(amount);
      const parts = [1, Math.floor((totalCents - 1) / 2), totalCents - 1 - Math.floor((totalCents - 1) / 2)].filter((c) => c > 0);
      const payers = [A, B, A];
      const sources = ["pocket", "pocket", "company"] as const;
      const doc = store({
        createdBy: C,
        amount,
        rate,
        source: "multiple",
        payments: parts.map((c, i) => ({ paidBy: String(payers[i]), amount: c / 100, source: sources[i] })),
      });
      const stored = doc.payments as { amountInBaseCurrency: number; source: string }[];
      expect(stored.every((entry) => moneyToCents(entry.amountInBaseCurrency) >= 0)).toBe(true);
      expect(stored.reduce((sum, entry) => sum + moneyToCents(entry.amountInBaseCurrency), 0)).toBe(
        moneyToCents(doc.amountInBaseCurrency as number)
      );
      expect(moneyToCents(doc.pocketAmountInBaseCurrency as number)).toBe(
        stored.filter((entry) => entry.source === "pocket").reduce((sum, entry) => sum + moneyToCents(entry.amountInBaseCurrency), 0)
      );
      const a = stored.filter((_, i) => String(payers[i]) === String(A));
      expectAgreement(doc, {
        shares: shares(
          [A, { pocket: a.filter((e) => e.source === "pocket").reduce((s, e) => s + e.amountInBaseCurrency, 0), company: a.filter((e) => e.source === "company").reduce((s, e) => s + e.amountInBaseCurrency, 0) }],
          [B, { pocket: stored[1]?.amountInBaseCurrency ?? 0, company: 0 }]
        ),
        visible: [A, B, C],
      });
    });
  });
});
