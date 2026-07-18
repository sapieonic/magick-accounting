import { describe, it, expect } from "vitest";
import { normalizeGstAmount } from "@/lib/expense";

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
