import { describe, expect, it } from "vitest";
import { isIsoDate, normalizeExtraction } from "./receipt-extract";

const categories = [{ _id: "cat-travel", name: "Travel" }];
const currencies = [
  { _id: "cur-inr", code: "INR" },
  { _id: "cur-usd", code: "USD" },
];

describe("normalizeExtraction", () => {
  it("maps names and codes to ids, case-insensitively", () => {
    const result = normalizeExtraction(
      {
        title: " Uber ",
        amount: "450.5",
        gstAmount: 21.4,
        currencyCode: "usd",
        category: "travel",
        date: "2026-10-01",
        description: "Ride",
        travelType: "CAB",
      },
      categories,
      currencies,
      "2026-10-31"
    );
    expect(result).toEqual({
      title: "Uber",
      amount: 450.5,
      gstAmount: 21.4,
      date: "2026-10-01",
      description: "Ride",
      currency: "cur-usd",
      category: "cat-travel",
      travelType: "cab",
    });
  });

  it("drops invalid values instead of guessing", () => {
    const result = normalizeExtraction(
      { amount: "n/a", gstAmount: 10, currencyCode: "XYZ", category: "Rockets", date: "yesterday", travelType: "rocket" },
      categories,
      currencies,
      "2026-10-31"
    );
    expect(result).toMatchObject({
      title: "",
      amount: null,
      gstAmount: 10,
      currency: null,
      category: null,
      date: "2026-10-31",
      travelType: null,
    });
  });

  it("rejects GST larger than the total", () => {
    expect(normalizeExtraction({ amount: 100, gstAmount: 120 }, categories, currencies).gstAmount).toBeNull();
  });
});

describe("isIsoDate", () => {
  it("accepts only real calendar dates", () => {
    expect(isIsoDate("2026-10-31")).toBe(true);
    expect(isIsoDate("2024-02-29")).toBe(true);
    expect(isIsoDate("2026-02-31")).toBe(false);
    expect(isIsoDate("2026-13-45")).toBe(false);
    expect(isIsoDate("31/10/2026")).toBe(false);
    expect(isIsoDate(null)).toBe(false);
  });

  it("falls back to today for an impossible extracted date", () => {
    expect(normalizeExtraction({ date: "2026-02-31" }, categories, currencies, "2026-10-31").date).toBe(
      "2026-10-31"
    );
  });
});
