import { describe, expect, it, vi } from "vitest";
import { accountingFieldsChanged } from "./expense-form";
import { emptyExpenseValues, type ExpenseFormValues } from "./types";

vi.mock("@/lib/api", () => ({ api: {} }));

const initial: ExpenseFormValues = {
  ...emptyExpenseValues("2026-07-02"),
  title: "Client dinner",
  amount: "1000",
  gstAmount: "",
  currency: "currency-1",
  category: "category-1",
  department: "department-1",
  description: "",
  paymentSource: "pocket",
};

const payment = (paidBy: string, amount: string, source: "pocket" | "company", key = paidBy) => ({
  key,
  paidBy,
  amount,
  source,
});

describe("accountingFieldsChanged", () => {
  it("is false when nothing changed", () => {
    expect(accountingFieldsChanged(initial, { ...initial })).toBe(false);
  });

  it("ignores title, description and trip edits", () => {
    expect(
      accountingFieldsChanged(initial, {
        ...initial,
        title: "Team dinner",
        description: "With the client",
        trip: "trip-1",
        travelType: "food",
      })
    ).toBe(false);
  });

  it.each<[string, Partial<ExpenseFormValues>]>([
    ["amount", { amount: "1200" }],
    ["GST", { gstAmount: "180" }],
    ["currency", { currency: "currency-2" }],
    ["date", { date: "2026-07-03" }],
    ["category", { category: "category-2" }],
    ["department", { department: "department-2" }],
    ["payment source", { paymentSource: "company" }],
  ])("is true when the %s changes", (_field, change) => {
    expect(accountingFieldsChanged(initial, { ...initial, ...change })).toBe(true);
  });

  it("compares amounts as money, not text", () => {
    expect(accountingFieldsChanged(initial, { ...initial, amount: "1000.00" })).toBe(false);
    expect(accountingFieldsChanged({ ...initial, gstAmount: "18" }, { ...initial, gstAmount: "18.0" })).toBe(false);
    expect(accountingFieldsChanged(initial, { ...initial, amount: "1000.01" })).toBe(true);
  });

  it("treats clearing the GST as a change", () => {
    expect(accountingFieldsChanged({ ...initial, gstAmount: "18" }, { ...initial, gstAmount: "" })).toBe(true);
  });

  it("compares the pocket share only for a split", () => {
    const split = { ...initial, paymentSource: "split", pocketAmount: "400" };
    expect(accountingFieldsChanged(split, { ...split, pocketAmount: "400.00" })).toBe(false);
    expect(accountingFieldsChanged(split, { ...split, pocketAmount: "250" })).toBe(true);
    // A leftover pocket value from trying "Split" doesn't count once back on "Pocket".
    expect(accountingFieldsChanged(initial, { ...initial, pocketAmount: "250" })).toBe(false);
  });

  it("compares payers regardless of row order, and ignores rows once 'several people' is off", () => {
    const shared: ExpenseFormValues = {
      ...initial,
      paymentSource: "multiple",
      payments: [payment("asha", "600", "pocket"), payment("ravi", "400", "company")],
    };
    expect(
      accountingFieldsChanged(shared, {
        ...shared,
        payments: [payment("ravi", "400.00", "company", "row-2"), payment("asha", "600", "pocket", "row-1")],
      })
    ).toBe(false);
    expect(
      accountingFieldsChanged(shared, {
        ...shared,
        payments: [payment("asha", "600", "company"), payment("ravi", "400", "company")],
      })
    ).toBe(true);
    expect(
      accountingFieldsChanged(shared, {
        ...shared,
        payments: [payment("asha", "500", "pocket"), payment("ravi", "500", "company")],
      })
    ).toBe(true);
    expect(accountingFieldsChanged(initial, { ...initial, payments: [payment("asha", "1000", "pocket")] })).toBe(false);
  });

  it("is true when the receipt changed", () => {
    expect(accountingFieldsChanged(initial, { ...initial }, true)).toBe(true);
  });
});
