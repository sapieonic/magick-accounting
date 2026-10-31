import { describe, expect, it } from "vitest";
import { normalizeExtraction } from "./receipt-extract";

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
