import { beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { Aggregator } from "mingo";
import "mingo/init/system";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { verifyAuth, type AuthUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Expense from "@/models/Expense";

vi.mock("@/lib/auth", () => ({ verifyAuth: vi.fn() }));
vi.mock("@/lib/mongodb", () => ({ connectDB: vi.fn() }));
vi.mock("@/models/Expense", () => ({ default: { aggregate: vi.fn(), find: vi.fn() } }));
vi.mock("@/models/Department", () => ({ default: { countDocuments: vi.fn().mockResolvedValue(2) } }));
vi.mock("@/models/Category", () => ({ default: { countDocuments: vi.fn().mockResolvedValue(3) } }));
vi.mock("@/models/Currency", () => ({ default: {} }));
vi.mock("@/models/User", () => ({ default: {} }));

const oid = (hex: string) => new mongoose.Types.ObjectId(hex);
const ASHA = "66c1884c0853f8a76a4da201";
const RAVI = "66c1884c0853f8a76a4da202";
const ADMIN = "66c1884c0853f8a76a4da203";

// Asha submits a ₹10,000 bill she paid ₹2,000 of; Ravi paid the other ₹8,000.
// Ravi also has a ₹500 company expense of his own.
const docs = [
  {
    _id: oid("66c1884c0853f8a76a4da501"),
    createdBy: oid(ASHA),
    amount: 10000,
    amountInBaseCurrency: 10000,
    paymentSource: "multiple",
    pocketAmount: 10000,
    pocketAmountInBaseCurrency: 10000,
    payments: [
      { paidBy: oid(ASHA), amount: 2000, amountInBaseCurrency: 2000, source: "pocket" },
      { paidBy: oid(RAVI), amount: 8000, amountInBaseCurrency: 8000, source: "pocket" },
    ],
  },
  {
    _id: oid("66c1884c0853f8a76a4da502"),
    createdBy: oid(RAVI),
    amount: 500,
    amountInBaseCurrency: 500,
    paymentSource: "company",
    pocketAmount: 0,
    pocketAmountInBaseCurrency: 0,
    payments: [],
  },
];

function signIn(_id: string, role: AuthUser["role"]) {
  vi.mocked(verifyAuth).mockResolvedValue({ _id, email: "x@example.com", name: "X", role });
}

function recentQuery() {
  const query = { populate: vi.fn(() => query), sort: vi.fn(() => query), limit: vi.fn(() => query), lean: vi.fn().mockResolvedValue([]) };
  return query;
}

async function stats() {
  const response = await GET({ url: "http://localhost/api/dashboard/stats" } as NextRequest);
  return response.json();
}

describe("GET /api/dashboard/stats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(connectDB).mockResolvedValue(undefined as never);
    vi.mocked(Expense.aggregate).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((pipeline: any[]) => Promise.resolve(new Aggregator(pipeline).run(docs))) as never
    );
    vi.mocked(Expense.find).mockReturnValue(recentQuery() as never);
  });

  it("gives a submitter only their own part of a bill others helped pay", async () => {
    signIn(ASHA, "user");
    expect(await stats()).toEqual(
      expect.objectContaining({ totalExpenses: 1, totalAmount: 2000, pocketAmount: 2000, companyAmount: 0 })
    );
  });

  it("gives a payer their part of someone else's bill, plus their own expenses", async () => {
    signIn(RAVI, "user");
    expect(await stats()).toEqual(
      expect.objectContaining({ totalExpenses: 2, totalAmount: 8500, pocketAmount: 8000, companyAmount: 500 })
    );
  });

  it("gives an admin the whole company, which the people's figures add up to", async () => {
    signIn(ADMIN, "admin");
    expect(await stats()).toEqual(
      expect.objectContaining({ totalExpenses: 2, totalAmount: 10500, pocketAmount: 10000, companyAmount: 500 })
    );
  });

  it("lists a user's recent expenses including the shared ones they paid part of", async () => {
    signIn(RAVI, "user");
    await stats();
    expect((vi.mocked(Expense.find).mock.calls[0] as unknown[])[0]).toEqual({
      $and: [{ $or: [{ createdBy: oid(RAVI) }, { paymentSource: "multiple", "payments.paidBy": oid(RAVI) }] }],
    });
  });

  it("lists an admin's own recent expenses", async () => {
    signIn(ADMIN, "admin");
    await stats();
    expect((vi.mocked(Expense.find).mock.calls[0] as unknown[])[0]).toEqual({ createdBy: oid(ADMIN) });
  });
});
