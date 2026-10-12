import { describe, it, expect } from "vitest";
import {
  companyBaseExpr,
  getPaymentBreakdown,
  normalizeGstAmount,
  normalizePaymentSplit,
  pocketAmountInBase,
  pocketBaseExpr,
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
