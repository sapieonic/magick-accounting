import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyAuth } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Expense from "@/models/Expense";
import Currency from "@/models/Currency";
import Asset from "@/models/Asset";
import User from "@/models/User";

vi.mock("@/lib/auth", () => ({ verifyAuth: vi.fn() }));
vi.mock("@/lib/mongodb", () => ({ connectDB: vi.fn() }));
vi.mock("@/lib/mongodb-transaction", () => ({
  runInTransaction: vi.fn((work) => work(null, true)),
  sessionOptions: vi.fn(() => ({})),
}));
vi.mock("@/lib/asset-server", () => ({
  compensateAssetCreation: vi.fn(),
  createAssetsForExpense: vi.fn(),
  ensureAssetIndexes: vi.fn(),
}));
vi.mock("@/models/Expense", () => ({
  default: { create: vi.fn(), exists: vi.fn(), findById: vi.fn(), deleteOne: vi.fn() },
}));
vi.mock("@/models/Currency", () => ({ default: { findById: vi.fn(), findOne: vi.fn() } }));
vi.mock("@/models/Asset", () => ({ default: { find: vi.fn() } }));
vi.mock("@/models/Category", () => ({ default: {} }));
vi.mock("@/models/Department", () => ({ default: {} }));
vi.mock("@/models/User", () => ({ default: { countDocuments: vi.fn() } }));

describe("POST /api/expenses payment split", () => {
  const expenseId = "66c1884c0853f8a76a4da111";

  function chain(result: unknown) {
    const query = {
      populate: vi.fn(() => query),
      sort: vi.fn(() => query),
      lean: vi.fn().mockResolvedValue(result),
    };
    return query;
  }

  function post(body: Record<string, unknown>) {
    return POST({
      json: async () => ({
        title: "Client dinner",
        amount: 100,
        currency: "usd-id",
        category: "category-id",
        department: "department-id",
        date: "2026-06-01",
        ...body,
      }),
    } as unknown as NextRequest);
  }

  function createdExpense() {
    return (vi.mocked(Expense.create).mock.calls[0][0] as unknown as Record<string, unknown>[])[0];
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(connectDB).mockResolvedValue(undefined);
    vi.mocked(verifyAuth).mockResolvedValue({
      _id: "user-id",
      email: "user@example.com",
      name: "User",
      role: "user",
    });
    vi.mocked(Currency.findById).mockReturnValue(chain({ _id: "usd-id", rateToBase: 83 }) as never);
    vi.mocked(Expense.create).mockResolvedValue([{ _id: expenseId }] as never);
    vi.mocked(Asset.find).mockReturnValue(chain([]) as never);
    vi.mocked(Expense.findById).mockReturnValue(chain({ _id: expenseId }) as never);
  });

  it("stores a split with its pocket share in base currency", async () => {
    const response = await post({ paymentSource: "split", pocketAmount: 40 });

    expect(response.status).toBe(201);
    expect(createdExpense()).toEqual(
      expect.objectContaining({
        amountInBaseCurrency: 8300,
        paymentSource: "split",
        pocketAmount: 40,
        pocketAmountInBaseCurrency: 3320,
      })
    );
  });

  it("defaults a missing payment source to pocket for the whole amount", async () => {
    const response = await post({});

    expect(response.status).toBe(201);
    expect(createdExpense()).toEqual(
      expect.objectContaining({
        paymentSource: "pocket",
        pocketAmount: 100,
        pocketAmountInBaseCurrency: 8300,
      })
    );
  });

  it("stores a zero pocket share for company-paid expenses", async () => {
    await post({ paymentSource: "company", pocketAmount: 40 });

    expect(createdExpense()).toEqual(
      expect.objectContaining({
        paymentSource: "company",
        pocketAmount: 0,
        pocketAmountInBaseCurrency: 0,
      })
    );
  });

  it("rejects a split pocket amount that is not less than the total", async () => {
    const response = await post({ paymentSource: "split", pocketAmount: 100 });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Pocket amount must be more than 0 and less than the total amount",
    });
    expect(Expense.create).not.toHaveBeenCalled();
  });

  describe("paid by several people", () => {
    const asha = "66c1884c0853f8a76a4da201";
    const ravi = "66c1884c0853f8a76a4da202";

    it("stores each payer's part with base amounts that add up to the total", async () => {
      vi.mocked(User.countDocuments).mockResolvedValue(2 as never);

      const response = await post({
        amount: 100,
        paymentSource: "multiple",
        payments: [
          { paidBy: asha, amount: 33.33, source: "pocket" },
          { paidBy: ravi, amount: 33.33, source: "company" },
          { paidBy: asha, amount: 33.34, source: "company" },
        ],
      });

      expect(response.status).toBe(201);
      expect(User.countDocuments).toHaveBeenCalledWith({ _id: { $in: [asha, ravi] } });
      expect(createdExpense()).toEqual(
        expect.objectContaining({
          amountInBaseCurrency: 8300,
          paymentSource: "multiple",
          pocketAmount: 33.33,
          pocketAmountInBaseCurrency: 2766.39,
          payments: [
            { paidBy: asha, amount: 33.33, source: "pocket", amountInBaseCurrency: 2766.39 },
            { paidBy: ravi, amount: 33.33, source: "company", amountInBaseCurrency: 2766.39 },
            { paidBy: asha, amount: 33.34, source: "company", amountInBaseCurrency: 2767.22 },
          ],
        })
      );
    });

    it("rejects payments that don't add up to the total", async () => {
      const response = await post({
        amount: 100,
        paymentSource: "multiple",
        payments: [
          { paidBy: asha, amount: 60, source: "pocket" },
          { paidBy: ravi, amount: 30, source: "pocket" },
        ],
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "Payments add up to 90.00 but the total amount is 100.00",
      });
      expect(Expense.create).not.toHaveBeenCalled();
    });

    it("rejects a payer who isn't a user", async () => {
      vi.mocked(User.countDocuments).mockResolvedValue(1 as never);

      const response = await post({
        amount: 100,
        paymentSource: "multiple",
        payments: [
          { paidBy: asha, amount: 50, source: "pocket" },
          { paidBy: ravi, amount: 50, source: "pocket" },
        ],
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "A payer is not a user of this app" });
      expect(Expense.create).not.toHaveBeenCalled();
    });

    it("stores no payer list for other payment sources", async () => {
      await post({
        paymentSource: "pocket",
        payments: [{ paidBy: asha, amount: 100, source: "company" }],
      });

      expect(createdExpense()).toEqual(expect.objectContaining({ paymentSource: "pocket", payments: [] }));
      expect(User.countDocuments).not.toHaveBeenCalled();
    });
  });
});
