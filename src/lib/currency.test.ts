import { describe, it, expect } from "vitest";
import { formatBaseCurrency, formatCurrency, BASE_CURRENCY_CODE } from "@/lib/currency";

describe("formatCurrency", () => {
  it("defaults to the base currency (INR)", () => {
    expect(BASE_CURRENCY_CODE).toBe("INR");
    expect(formatCurrency(1000)).toBe(formatCurrency(1000, "INR"));
  });

  it("formats a known currency with two fraction digits", () => {
    const formatted = formatCurrency(1234.5, "USD");
    expect(formatted).toContain("1,234.50");
  });

  it("falls back gracefully for an unknown currency code", () => {
    const formatted = formatCurrency(1234.5, "ZZZ");
    expect(formatted).toContain("ZZZ");
    expect(formatted).toContain("1,234.50");
  });
});

describe("formatBaseCurrency", () => {
  it("formats using the INR base currency", () => {
    expect(formatBaseCurrency(500)).toBe(formatCurrency(500, "INR"));
  });
});
