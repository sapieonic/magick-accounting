import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { DELETE, PUT } from "./route";
import { verifyAuth } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { deleteObject } from "@/lib/s3";
import Expense from "@/models/Expense";
import Asset from "@/models/Asset";
import Currency from "@/models/Currency";
import User from "@/models/User";

vi.mock("@/lib/auth", () => ({ verifyAuth: vi.fn() }));
vi.mock("@/lib/mongodb", () => ({ connectDB: vi.fn() }));
vi.mock("@/lib/s3", () => ({ deleteObject: vi.fn() }));
vi.mock("@/models/Expense", () => ({
  default: { findById: vi.fn(), deleteOne: vi.fn(), exists: vi.fn(), findOneAndUpdate: vi.fn() },
}));
vi.mock("@/models/Asset", () => ({
  default: { find: vi.fn(), countDocuments: vi.fn() },
}));
vi.mock("@/models/Currency", () => ({ default: { findById: vi.fn() } }));
vi.mock("@/models/Category", () => ({ default: {} }));
vi.mock("@/models/Department", () => ({ default: {} }));
vi.mock("@/models/User", () => ({ default: { countDocuments: vi.fn() } }));

describe("DELETE /api/expenses/:id", () => {
  const expenseId = "66c1884c0853f8a76a4da111";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(connectDB).mockResolvedValue(undefined);
    vi.mocked(verifyAuth).mockResolvedValue({
      _id: "admin-id",
      email: "admin@example.com",
      name: "Admin",
      role: "admin",
    });
    vi.mocked(Expense.findById).mockResolvedValue({
      _id: expenseId,
      createdBy: { toString: () => "owner-id" },
      receiptKey: "receipts/owner-id/key.pdf",
      assetAllocationRevision: 4,
    } as never);
    vi.mocked(Asset.countDocuments).mockResolvedValue(0);
    vi.mocked(deleteObject).mockResolvedValue(undefined);
  });

  it("deletes with an allocation-revision CAS before removing the receipt", async () => {
    vi.mocked(Expense.deleteOne).mockResolvedValue({ deletedCount: 1 } as never);

    const response = await DELETE({} as NextRequest, {
      params: Promise.resolve({ id: expenseId }),
    });

    expect(response.status).toBe(200);
    expect(Expense.deleteOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: expenseId,
        $and: expect.arrayContaining([
          { assetAllocationRevision: 4 },
          expect.objectContaining({ $or: expect.any(Array) }),
        ]),
      })
    );
    expect(vi.mocked(Expense.deleteOne).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(deleteObject).mock.invocationCallOrder[0]
    );
  });

  it("returns a conflict when a concurrent asset reservation wins", async () => {
    vi.mocked(Expense.deleteOne).mockResolvedValue({ deletedCount: 0 } as never);

    const response = await DELETE({} as NextRequest, {
      params: Promise.resolve({ id: expenseId }),
    });

    expect(response.status).toBe(409);
    expect(deleteObject).not.toHaveBeenCalled();
  });
});

describe("PUT /api/expenses/:id payment split", () => {
  const expenseId = "66c1884c0853f8a76a4da111";
  const objectIdLike = (value: string) => ({ toString: () => value });

  function mockStoredExpense(overrides: Record<string, unknown> = {}) {
    vi.mocked(Expense.findById).mockResolvedValue({
      _id: expenseId,
      title: "Laptop stand",
      description: "",
      createdBy: objectIdLike("owner-id"),
      amount: 100,
      gstAmount: null,
      currency: objectIdLike("usd-id"),
      amountInBaseCurrency: 8300,
      exchangeRateToBase: 83,
      date: new Date("2026-06-01T00:00:00.000Z"),
      category: objectIdLike("category-id"),
      department: objectIdLike("department-id"),
      paymentSource: "split",
      pocketAmount: 40,
      pocketAmountInBaseCurrency: 3320,
      assetAllocationRevision: 0,
      ...overrides,
    } as never);
  }

  function mockUpdateResult() {
    const query = {
      populate: vi.fn(() => query),
      lean: vi.fn().mockResolvedValue({ _id: expenseId }),
    };
    vi.mocked(Expense.findOneAndUpdate).mockReturnValue(query as never);
  }

  function linkAsset() {
    vi.mocked(Asset.find).mockResolvedValue([
      {
        allocatedAmount: 50,
        allocatedGstAmount: 0,
        putToUseDate: new Date("2026-07-01T00:00:00.000Z"),
      },
    ] as never);
  }

  function put(body: Record<string, unknown>) {
    return PUT({ json: async () => body } as unknown as NextRequest, {
      params: Promise.resolve({ id: expenseId }),
    });
  }

  function storedUpdate() {
    return vi.mocked(Expense.findOneAndUpdate).mock.calls[0][1] as {
      $set: Record<string, unknown>;
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(connectDB).mockResolvedValue(undefined);
    vi.mocked(verifyAuth).mockResolvedValue({
      _id: "admin-id",
      email: "admin@example.com",
      name: "Admin",
      role: "admin",
    });
    vi.mocked(Asset.find).mockResolvedValue([] as never);
    mockStoredExpense({ paymentSource: "pocket", pocketAmount: 100, pocketAmountInBaseCurrency: 8300 });
    mockUpdateResult();
  });

  it("stores a split with its pocket share converted at the expense rate", async () => {
    const response = await put({ paymentSource: "split", pocketAmount: 40 });

    expect(response.status).toBe(200);
    expect(storedUpdate().$set).toEqual(
      expect.objectContaining({
        paymentSource: "split",
        pocketAmount: 40,
        amountInBaseCurrency: 8300,
        pocketAmountInBaseCurrency: 3320,
      })
    );
  });

  it("asks for a pocket amount when switching to split without one", async () => {
    const response = await put({ paymentSource: "split" });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Enter the amount paid from pocket for a split payment",
    });
    expect(Expense.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("rejects an empty payment source instead of defaulting it to pocket", async () => {
    mockStoredExpense({ paymentSource: "company", pocketAmount: 0, pocketAmountInBaseCurrency: 0 });

    const response = await put({ paymentSource: "" });

    expect(response.status).toBe(400);
    expect(Expense.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("rejects lowering the amount below the stored split pocket amount", async () => {
    mockStoredExpense();

    const response = await put({ amount: 30 });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Pocket amount must be more than 0 and less than the total amount",
    });
    expect(Expense.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("requires an admin when a user changes the pocket amount of an asset-linked expense", async () => {
    mockStoredExpense();
    linkAsset();
    vi.mocked(verifyAuth).mockResolvedValue({
      _id: "owner-id",
      email: "owner@example.com",
      name: "Owner",
      role: "user",
    });

    const response = await put({ paymentSource: "split", pocketAmount: 30 });

    expect(response.status).toBe(403);
    expect(Expense.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("lets a user edit unprotected fields of an asset-linked legacy expense", async () => {
    // Legacy docs predate pocketAmount; the whole amount counts as pocket.
    mockStoredExpense({
      paymentSource: "pocket",
      pocketAmount: null,
      pocketAmountInBaseCurrency: null,
    });
    linkAsset();
    vi.mocked(verifyAuth).mockResolvedValue({
      _id: "owner-id",
      email: "owner@example.com",
      name: "Owner",
      role: "user",
    });

    const response = await put({ title: "Standing desk", paymentSource: "pocket" });

    expect(response.status).toBe(200);
    expect(storedUpdate().$set).toEqual(
      expect.objectContaining({
        title: "Standing desk",
        paymentSource: "pocket",
        pocketAmount: 100,
        pocketAmountInBaseCurrency: 8300,
      })
    );
  });

  it("moves the whole amount to one side when a split becomes pocket or company", async () => {
    mockStoredExpense();
    expect((await put({ paymentSource: "company", pocketAmount: 40 })).status).toBe(200);
    expect(storedUpdate().$set).toEqual(
      expect.objectContaining({ paymentSource: "company", pocketAmount: 0, pocketAmountInBaseCurrency: 0 })
    );

    vi.mocked(Expense.findOneAndUpdate).mockClear();
    expect((await put({ paymentSource: "pocket" })).status).toBe(200);
    expect(storedUpdate().$set).toEqual(
      expect.objectContaining({ paymentSource: "pocket", pocketAmount: 100, pocketAmountInBaseCurrency: 8300 })
    );
  });

  it("recomputes the pocket base share at the new rate when a split's currency changes", async () => {
    mockStoredExpense();
    vi.mocked(Currency.findById).mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: "eur-id", rateToBase: 90 }),
    } as never);

    const response = await put({ currency: "eur-id" });

    expect(response.status).toBe(200);
    expect(storedUpdate().$set).toEqual(
      expect.objectContaining({
        currency: "eur-id",
        amountInBaseCurrency: 9000,
        pocketAmount: 40,
        pocketAmountInBaseCurrency: 3600,
      })
    );
  });

  it("lets an admin change the pocket amount of an asset-linked split", async () => {
    mockStoredExpense();
    linkAsset();

    const response = await put({ paymentSource: "split", pocketAmount: 30 });

    expect(response.status).toBe(200);
    expect(storedUpdate().$set).toEqual(
      expect.objectContaining({ pocketAmount: 30, pocketAmountInBaseCurrency: 2490 })
    );
  });

  it("lets a user resave an asset-linked split unchanged apart from unprotected fields", async () => {
    mockStoredExpense();
    linkAsset();
    vi.mocked(verifyAuth).mockResolvedValue({
      _id: "owner-id",
      email: "owner@example.com",
      name: "Owner",
      role: "user",
    });

    // The edit form resends every field, including the unchanged split.
    const response = await put({ title: "Monitor arm", amount: 100, paymentSource: "split", pocketAmount: 40 });

    expect(response.status).toBe(200);
    expect(storedUpdate().$set).toEqual(
      expect.objectContaining({ title: "Monitor arm", paymentSource: "split", pocketAmount: 40 })
    );
  });

  it("keeps a stored split when the amount grows, so the company share absorbs it", async () => {
    mockStoredExpense();

    const response = await put({ amount: 150 });

    expect(response.status).toBe(200);
    expect(storedUpdate().$set).toEqual(
      expect.objectContaining({
        amount: 150,
        amountInBaseCurrency: 12450,
        paymentSource: "split",
        pocketAmount: 40,
        pocketAmountInBaseCurrency: 3320,
      })
    );
  });

  describe("paid by several people", () => {
    const asha = "66c1884c0853f8a76a4da201";
    const ravi = "66c1884c0853f8a76a4da202";

    function mockStoredMultiple(overrides: Record<string, unknown> = {}) {
      mockStoredExpense({
        paymentSource: "multiple",
        pocketAmount: 60,
        pocketAmountInBaseCurrency: 4980,
        payments: [
          { paidBy: objectIdLike(asha), amount: 60, amountInBaseCurrency: 4980, source: "pocket" },
          { paidBy: objectIdLike(ravi), amount: 40, amountInBaseCurrency: 3320, source: "company" },
        ],
        ...overrides,
      });
    }

    beforeEach(() => {
      vi.mocked(User.countDocuments).mockResolvedValue(2 as never);
    });

    it("switches to several payers and stores each part", async () => {
      const response = await put({
        paymentSource: "multiple",
        payments: [
          { paidBy: asha, amount: 25, source: "company" },
          { paidBy: ravi, amount: 75, source: "pocket" },
        ],
      });

      expect(response.status).toBe(200);
      expect(storedUpdate().$set).toEqual(
        expect.objectContaining({
          paymentSource: "multiple",
          pocketAmount: 75,
          pocketAmountInBaseCurrency: 6225,
          payments: [
            { paidBy: asha, amount: 25, source: "company", amountInBaseCurrency: 2075 },
            { paidBy: ravi, amount: 75, source: "pocket", amountInBaseCurrency: 6225 },
          ],
        })
      );
    });

    it("keeps the stored payers when only unrelated fields change", async () => {
      mockStoredMultiple();

      const response = await put({ title: "Team lunch" });

      expect(response.status).toBe(200);
      expect(storedUpdate().$set).toEqual(
        expect.objectContaining({
          title: "Team lunch",
          paymentSource: "multiple",
          pocketAmount: 60,
          payments: [
            { paidBy: asha, amount: 60, source: "pocket", amountInBaseCurrency: 4980 },
            { paidBy: ravi, amount: 40, source: "company", amountInBaseCurrency: 3320 },
          ],
        })
      );
    });

    it("rejects changing the amount without updating the payers", async () => {
      mockStoredMultiple();

      const response = await put({ amount: 120 });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "Payments add up to 100.00 but the total amount is 120.00",
      });
      expect(Expense.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it("clears the payers when switching back to a single source", async () => {
      mockStoredMultiple();

      const response = await put({ paymentSource: "company" });

      expect(response.status).toBe(200);
      expect(storedUpdate().$set).toEqual(
        expect.objectContaining({ paymentSource: "company", pocketAmount: 0, payments: [] })
      );
    });

    it("requires an admin when a user changes the payers of an asset-linked expense", async () => {
      mockStoredMultiple();
      linkAsset();
      vi.mocked(verifyAuth).mockResolvedValue({
        _id: "owner-id",
        email: "owner@example.com",
        name: "Owner",
        role: "user",
      });

      const response = await put({
        payments: [
          { paidBy: asha, amount: 60, source: "company" },
          { paidBy: ravi, amount: 40, source: "company" },
        ],
      });

      expect(response.status).toBe(403);
      expect(Expense.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });
});
