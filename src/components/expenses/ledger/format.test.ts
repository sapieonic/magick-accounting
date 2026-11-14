import { describe, it, expect } from "vitest";
import { conversionNote } from "./format";
import type { ExpenseListItem } from "@/types/expense";

const USD = { _id: "usd", code: "USD", name: "US Dollar", symbol: "$", isBase: false };
const INR = { _id: "inr", code: "INR", name: "Indian Rupee", symbol: "₹", isBase: true };

function makeExpense(overrides: Partial<ExpenseListItem> = {}): ExpenseListItem {
  return {
    _id: "exp-1",
    title: "Stamp",
    amount: 0.07,
    // 0.07 × 83.4567, rounded to the paisa on entry.
    amountInBaseCurrency: 5.84,
    exchangeRateToBase: 83.4567,
    currency: USD,
    date: "2026-10-13T00:00:00.000Z",
    description: "",
    category: { _id: "cat", name: "Office" },
    department: { _id: "dep", name: "Sales" },
    createdBy: { _id: "u1", name: "Asha Rao", email: "asha@example.com" },
    ...overrides,
  };
}

describe("conversionNote", () => {
  it("shows the rate stored on entry, not one divided back out of the rounded base amount", () => {
    // 5.84 / 0.07 would read ₹83.43.
    expect(conversionNote(makeExpense())).toBe("= ₹5.84 at ₹83.46 per USD, fixed on entry");
  });

  it("falls back to base / amount for documents without a stored rate", () => {
    expect(
      conversionNote(makeExpense({ amount: 100, amountInBaseCurrency: 8350, exchangeRateToBase: undefined }))
    ).toBe("= ₹8,350.00 at ₹83.50 per USD, fixed on entry");
  });

  it("has no note for base-currency amounts", () => {
    expect(conversionNote(makeExpense({ currency: INR }))).toBeNull();
  });
});
