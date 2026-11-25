import { describe, expect, it, vi } from "vitest";
import { accountingFieldsChanged, listFields, mergeAfterConflict } from "./expense-form";
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

  it("ignores moving it into a trip", () => {
    expect(accountingFieldsChanged(initial, { ...initial, trip: "trip-1", travelType: "food" })).toBe(false);
  });

  it("compares the title and description trimmed, like the server", () => {
    expect(
      accountingFieldsChanged(
        { ...initial, description: "With the client" },
        { ...initial, title: "  Client dinner ", description: "With the client\n" }
      )
    ).toBe(false);
    // Clearing a description is a change; blanking it to spaces is clearing it.
    expect(accountingFieldsChanged({ ...initial, description: "With the client" }, { ...initial, description: "  " })).toBe(
      true
    );
  });

  it.each<[string, Partial<ExpenseFormValues>]>([
    ["title", { title: "Team dinner" }],
    ["description", { description: "With the client" }],
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

describe("mergeAfterConflict", () => {
  it("takes the saved value for fields the person didn't touch, and keeps the ones they changed", () => {
    const mine = { ...initial, title: "Client dinner with Ravi" };
    const theirs = { ...initial, amount: "1500", description: "Corrected" };
    const { values, overlaps } = mergeAfterConflict(initial, mine, theirs);
    expect(values).toEqual({ ...initial, title: "Client dinner with Ravi", amount: "1500", description: "Corrected" });
    expect(overlaps).toEqual([]);
  });

  it("keeps the person's value where both changed it differently, and lists the field", () => {
    const mine = { ...initial, amount: "1200", date: "2026-07-05" };
    const theirs = { ...initial, amount: "1500", date: "2026-07-05" };
    const { values, overlaps } = mergeAfterConflict(initial, mine, theirs);
    expect(values.amount).toBe("1200");
    expect(values.date).toBe("2026-07-05");
    // Both set the same date: nothing to check.
    expect(overlaps).toEqual(["Amount"]);
  });

  it("compares amounts as money, so retyping the same figure isn't an edit", () => {
    const { values, overlaps } = mergeAfterConflict(initial, { ...initial, amount: "1000.00" }, { ...initial, amount: "1500" });
    expect(values.amount).toBe("1500");
    expect(overlaps).toEqual([]);
  });

  it("merges who paid as a whole", () => {
    const split = { ...initial, paymentSource: "split", pocketAmount: "400" };
    const shared: ExpenseFormValues = {
      ...initial,
      paymentSource: "multiple",
      payments: [payment("asha", "600", "pocket"), payment("ravi", "400", "company")],
    };
    // Untouched: the saved payers come in with their source.
    expect(mergeAfterConflict(initial, { ...initial }, shared).values).toMatchObject({
      paymentSource: "multiple",
      payments: shared.payments,
    });
    // Changed by the person: their split stays whole, and differs from the saved payers.
    const both = mergeAfterConflict(initial, split, shared);
    expect(both.values).toMatchObject({ paymentSource: "split", pocketAmount: "400", payments: [] });
    expect(both.overlaps).toEqual(["Who paid"]);
  });

  it("merges the trip with its travel type", () => {
    const inTrip = { ...initial, trip: "trip-1", travelType: "stay" as const };
    const { values } = mergeAfterConflict(initial, { ...initial, title: "Hotel" }, inTrip);
    expect(values).toMatchObject({ title: "Hotel", trip: "trip-1", travelType: "stay" });
  });
});

describe("listFields", () => {
  it("joins field names in plain words", () => {
    expect(listFields(["Amount"])).toBe("Amount");
    expect(listFields(["Amount", "Date"])).toBe("Amount and Date");
    expect(listFields(["Title", "Amount", "Date"])).toBe("Title, Amount and Date");
  });
});
