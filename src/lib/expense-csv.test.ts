import { describe, it, expect } from "vitest";
import { EXPENSE_CSV_HEADERS, expenseCsvRow, paymentSourceLabel } from "@/lib/expense-csv";

const base = {
  date: "2026-07-02T00:00:00.000Z",
  title: "Team lunch",
  currency: { code: "INR" },
  category: { name: "Meals & Entertainment" },
  department: { name: "Engineering" },
  createdBy: { name: "Asha" },
  description: "",
};

function column(row: unknown[], header: string): unknown {
  return row[EXPENSE_CSV_HEADERS.indexOf(header)];
}

describe("paymentSourceLabel", () => {
  it("labels each source, treating a missing source as pocket", () => {
    expect(paymentSourceLabel("pocket")).toBe("Pocket");
    expect(paymentSourceLabel("company")).toBe("Company account");
    expect(paymentSourceLabel("split")).toBe("Split");
    expect(paymentSourceLabel(undefined)).toBe("Pocket");
  });
});

describe("expenseCsvRow", () => {
  it("has one cell per header", () => {
    expect(expenseCsvRow({ ...base, amount: 100 })).toHaveLength(EXPENSE_CSV_HEADERS.length);
  });

  it("splits the base amount for a split expense", () => {
    const row = expenseCsvRow({
      ...base,
      amount: 1000,
      amountInBaseCurrency: 1000,
      paymentSource: "split",
      pocketAmount: 400,
      pocketAmountInBaseCurrency: 400,
    });
    expect(column(row, "Paid From")).toBe("Split");
    expect(column(row, "Amount (Base)")).toBe(1000);
    expect(column(row, "Pocket (Base)")).toBe(400);
    expect(column(row, "Company (Base)")).toBe(600);
  });

  it("uses base-currency shares for a foreign-currency split", () => {
    const row = expenseCsvRow({
      ...base,
      currency: { code: "USD" },
      amount: 100,
      amountInBaseCurrency: 8350,
      paymentSource: "split",
      pocketAmount: 25,
      pocketAmountInBaseCurrency: 2087.5,
    });
    expect(column(row, "Amount")).toBe(100);
    expect(column(row, "Pocket (Base)")).toBe(2087.5);
    expect(column(row, "Company (Base)")).toBe(6262.5);
  });

  it("puts the whole amount on one side for legacy pocket and company expenses", () => {
    const pocket = expenseCsvRow({ ...base, amount: 250, amountInBaseCurrency: 250, paymentSource: "pocket" });
    expect(column(pocket, "Paid From")).toBe("Pocket");
    expect(column(pocket, "Pocket (Base)")).toBe(250);
    expect(column(pocket, "Company (Base)")).toBe(0);

    const company = expenseCsvRow({ ...base, amount: 250, amountInBaseCurrency: 250, paymentSource: "company" });
    expect(column(company, "Paid From")).toBe("Company account");
    expect(column(company, "Pocket (Base)")).toBe(0);
    expect(column(company, "Company (Base)")).toBe(250);
  });

  it("falls back to the amount when the base amount is missing", () => {
    const row = expenseCsvRow({ ...base, amount: 75 });
    expect(column(row, "Amount (Base)")).toBe(75);
    expect(column(row, "Pocket (Base)")).toBe(75);
    expect(column(row, "Company (Base)")).toBe(0);
  });
});
