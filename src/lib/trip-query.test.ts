import { describe, it, expect, vi } from "vitest";
import mongoose from "mongoose";
import { Aggregator } from "mingo";
import "mingo/init/system";

vi.mock("@/models/Expense", () => ({ default: {} }));
vi.mock("@/models/Asset", () => ({ default: {} }));
vi.mock("@/models/Trip", () => ({ default: {} }));
vi.mock("@/models/User", () => ({ default: {} }));
vi.mock("@/models/Department", () => ({ default: {} }));
vi.mock("@/models/Category", () => ({ default: {} }));
vi.mock("@/models/Currency", () => ({ default: {} }));

import { tripDetailSummaryPipeline, tripTotalsPipeline } from "@/lib/trip-query";

const oid = () => new mongoose.Types.ObjectId();
const goa = oid();
const pune = oid();
const asha = oid();
const ravi = oid();

function run(pipeline: unknown[], docs: Record<string, unknown>[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Aggregator(pipeline as any[]).run(docs) as any[];
}

// Base-currency amounts; `pocketAmountInBaseCurrency` absent means a legacy doc.
const docs = [
  { trip: goa, createdBy: asha, amount: 10, amountInBaseCurrency: 1000, paymentSource: "pocket", pocketAmountInBaseCurrency: 1000 },
  { trip: goa, createdBy: ravi, amount: 5, amountInBaseCurrency: 500, paymentSource: "company", pocketAmountInBaseCurrency: 0 },
  {
    trip: goa,
    createdBy: asha,
    amount: 30,
    amountInBaseCurrency: 3000,
    paymentSource: "multiple",
    pocketAmountInBaseCurrency: 1000,
    payments: [
      { paidBy: ravi, amount: 10, amountInBaseCurrency: 1000, source: "pocket" },
      { paidBy: asha, amount: 20, amountInBaseCurrency: 2000, source: "company" },
    ],
  },
  { trip: goa, createdBy: ravi, amount: 2 }, // legacy: no base amount or pocket fields
  { trip: pune, createdBy: asha, amount: 7, amountInBaseCurrency: 700 },
  { trip: null, createdBy: asha, amount: 9, amountInBaseCurrency: 900 },
];

describe("tripTotalsPipeline", () => {
  it("counts and totals each trip's matching expenses in base currency", () => {
    const rows = run(tripTotalsPipeline({}, [goa, pune]), docs);
    const byTrip = Object.fromEntries(rows.map((row) => [String(row._id), row]));

    expect(byTrip[String(goa)]).toEqual(expect.objectContaining({ expenseCount: 4, totalAmount: 4502 }));
    expect(byTrip[String(pune)]).toEqual(expect.objectContaining({ expenseCount: 1, totalAmount: 700 }));
  });

  it("applies the caller's visibility", () => {
    const rows = run(tripTotalsPipeline({ createdBy: ravi }, [goa]), docs);
    expect(rows).toEqual([expect.objectContaining({ expenseCount: 2, totalAmount: 502 })]);
  });
});

describe("tripDetailSummaryPipeline", () => {
  it("splits pocket and company, and credits each payer like Spend by User", () => {
    const [result] = run(tripDetailSummaryPipeline({ trip: goa }), docs);

    expect(result.totals[0]).toEqual(
      expect.objectContaining({
        totalAmount: 4502,
        expenseCount: 4,
        // 1000 (Asha's pocket) + 1000 (Ravi's pocket share) + 2 (legacy, counts as pocket)
        pocketAmount: 2002,
        companyAmount: 2500,
      })
    );
    const payers = Object.fromEntries(
      result.byPayer.map((row: { _id: unknown }) => [String(row._id), row])
    );
    expect(payers[String(asha)]).toEqual(
      expect.objectContaining({ totalSpend: 3000, pocketSpend: 1000, companySpend: 2000 })
    );
    expect(payers[String(ravi)]).toEqual(
      expect.objectContaining({ totalSpend: 1502, pocketSpend: 1002, companySpend: 500 })
    );
    // Largest spender first.
    expect(String(result.byPayer[0]._id)).toBe(String(asha));
  });
});
