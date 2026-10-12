import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyAuth } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Expense from "@/models/Expense";
import Currency from "@/models/Currency";
import Asset from "@/models/Asset";

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
});
