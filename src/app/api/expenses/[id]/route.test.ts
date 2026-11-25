import { beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { NextRequest } from "next/server";
import { DELETE, GET, PUT } from "./route";
import { verifyAuth } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { deleteObject } from "@/lib/s3";
import Expense from "@/models/Expense";
import Asset from "@/models/Asset";
import Currency from "@/models/Currency";
import User from "@/models/User";
import Trip from "@/models/Trip";

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
vi.mock("@/models/Trip", () => ({ default: { findById: vi.fn() } }));

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

  function remove() {
    return DELETE({} as NextRequest, { params: Promise.resolve({ id: expenseId }) });
  }

  it("returns asset_linked when a concurrent asset reservation wins", async () => {
    vi.mocked(Expense.deleteOne).mockResolvedValue({ deletedCount: 0 } as never);
    vi.mocked(Expense.findById)
      .mockResolvedValueOnce({
        _id: expenseId,
        createdBy: { toString: () => "owner-id" },
        receiptKey: "receipts/owner-id/key.pdf",
        assetAllocationRevision: 4,
      } as never)
      .mockResolvedValueOnce({ _id: expenseId, assetAllocatedAmount: 500, assetAllocationRevision: 5 } as never);

    const response = await remove();

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "This expense is linked to company assets and cannot be deleted",
      code: "asset_linked",
    });
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it("returns asset_linked when assets are already registered against it", async () => {
    vi.mocked(Asset.countDocuments).mockResolvedValue(2);

    const response = await remove();

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("asset_linked");
    expect(Expense.deleteOne).not.toHaveBeenCalled();
  });

  it("returns stale when it was edited or reviewed after the read", async () => {
    vi.mocked(Expense.deleteOne).mockResolvedValue({ deletedCount: 0 } as never);

    const response = await remove();

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "This expense changed after you opened it (for example, an admin reviewed it). Reload and try again.",
      code: "stale",
    });
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it("returns not_found when it was deleted after the read", async () => {
    vi.mocked(Expense.deleteOne).mockResolvedValue({ deletedCount: 0 } as never);
    vi.mocked(Expense.findById)
      .mockResolvedValueOnce({ _id: expenseId, createdBy: { toString: () => "owner-id" } } as never)
      .mockResolvedValueOnce(null as never);

    const response = await remove();

    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe("not_found");
  });
});

describe("GET /api/expenses/:id", () => {
  const expenseId = "66c1884c0853f8a76a4da111";

  it("keeps a named payer who didn't submit the expense out", async () => {
    vi.mocked(connectDB).mockResolvedValue(undefined);
    vi.mocked(verifyAuth).mockResolvedValue({
      _id: "payer-id",
      email: "payer@example.com",
      name: "Payer",
      role: "user",
    });
    const query = {
      populate: vi.fn(() => query),
      lean: vi.fn().mockResolvedValue({
        _id: expenseId,
        createdBy: { _id: "owner-id" },
        paymentSource: "multiple",
        payments: [
          { paidBy: { _id: "payer-id" }, amount: 60, source: "pocket" },
          { paidBy: { _id: "owner-id" }, amount: 40, source: "company" },
        ],
      }),
    };
    vi.mocked(Expense.findById).mockReturnValue(query as never);

    const response = await GET({} as NextRequest, { params: Promise.resolve({ id: expenseId }) });

    expect(response.status).toBe(403);
    expect(Asset.find).not.toHaveBeenCalled();
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

    it("lets a user resave an asset-linked expense with the same payers in any order", async () => {
      mockStoredMultiple();
      linkAsset();
      vi.mocked(verifyAuth).mockResolvedValue({
        _id: "owner-id",
        email: "owner@example.com",
        name: "Owner",
        role: "user",
      });

      const response = await put({
        title: "Team lunch",
        amount: 100,
        paymentSource: "multiple",
        payments: [
          { paidBy: ravi.toUpperCase(), amount: 40, source: "company" },
          { paidBy: asha, amount: 60, source: "pocket" },
        ],
      });

      expect(response.status).toBe(200);
      expect(storedUpdate().$set).toEqual(expect.objectContaining({ title: "Team lunch", pocketAmount: 60 }));
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

describe("PUT /api/expenses/:id trip", () => {
  const expenseId = "66c1884c0853f8a76a4da111";
  const ownerId = "66c1884c0853f8a76a4da201";
  const goa = "66c1884c0853f8a76a4da301";
  const pune = "66c1884c0853f8a76a4da302";
  const objectIdLike = (value: string) => ({ toString: () => value });

  function mockStoredExpense(overrides: Record<string, unknown> = {}) {
    vi.mocked(Expense.findById).mockResolvedValue({
      _id: expenseId,
      title: "Flight",
      description: "",
      createdBy: objectIdLike(ownerId),
      amount: 100,
      gstAmount: null,
      currency: objectIdLike("inr-id"),
      amountInBaseCurrency: 100,
      exchangeRateToBase: 1,
      date: new Date("2026-10-01T00:00:00.000Z"),
      category: objectIdLike("category-id"),
      department: objectIdLike("department-id"),
      paymentSource: "pocket",
      pocketAmount: 100,
      pocketAmountInBaseCurrency: 100,
      assetAllocationRevision: 0,
      trip: new mongoose.Types.ObjectId(goa),
      travelType: "flight",
      ...overrides,
    } as never);
  }

  function tripOn(travelers: string[]) {
    return {
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue({
        travelers: travelers.map((id) => new mongoose.Types.ObjectId(id)),
        createdBy: new mongoose.Types.ObjectId(),
      }),
    };
  }

  function put(body: Record<string, unknown>) {
    return PUT({ json: async () => body } as unknown as NextRequest, {
      params: Promise.resolve({ id: expenseId }),
    });
  }

  function storedUpdate() {
    return (vi.mocked(Expense.findOneAndUpdate).mock.calls[0][1] as { $set: Record<string, unknown> }).$set;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(connectDB).mockResolvedValue(undefined);
    vi.mocked(verifyAuth).mockResolvedValue({
      _id: ownerId,
      email: "owner@example.com",
      name: "Owner",
      role: "user",
    });
    vi.mocked(Asset.find).mockResolvedValue([] as never);
    mockStoredExpense();
    const query = {
      populate: vi.fn(() => query),
      lean: vi.fn().mockResolvedValue({ _id: expenseId }),
    };
    vi.mocked(Expense.findOneAndUpdate).mockReturnValue(query as never);
  });

  it("keeps the trip and travel type when they aren't sent, without re-checking the trip", async () => {
    const response = await put({ title: "Flight to Goa" });

    expect(response.status).toBe(200);
    expect(String(storedUpdate().trip)).toBe(goa);
    expect(storedUpdate().travelType).toBe("flight");
    // The owner may since have been taken off the trip; that's fine.
    expect(Trip.findById).not.toHaveBeenCalled();
    const query = vi.mocked(Expense.findOneAndUpdate).mock.results[0].value;
    expect(query.populate).toHaveBeenCalledWith("trip", "name");
  });

  it("doesn't re-check an unchanged trip the form resends", async () => {
    const response = await put({ trip: goa.toUpperCase(), travelType: "stay" });

    expect(response.status).toBe(200);
    expect(storedUpdate()).toEqual(expect.objectContaining({ travelType: "stay" }));
    expect(Trip.findById).not.toHaveBeenCalled();
  });

  it("clears the travel type with the trip", async () => {
    const response = await put({ trip: null });

    expect(response.status).toBe(200);
    expect(storedUpdate()).toEqual(expect.objectContaining({ trip: null, travelType: null }));
  });

  it("moves the expense to another trip the user is on", async () => {
    vi.mocked(Trip.findById).mockReturnValue(tripOn([ownerId]) as never);

    const response = await put({ trip: pune, travelType: "train" });

    expect(response.status).toBe(200);
    expect(Trip.findById).toHaveBeenCalledWith(pune);
    expect(String(storedUpdate().trip)).toBe(pune);
    expect(storedUpdate().travelType).toBe("train");
  });

  it("won't put a user's expense in a trip they aren't on", async () => {
    vi.mocked(Trip.findById).mockReturnValue(tripOn([]) as never);

    const response = await put({ trip: pune });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "You can only add expenses to trips you are on" });
    expect(Expense.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("rejects an unknown travel type", async () => {
    const response = await put({ travelType: "yacht" });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Travel type is invalid" });
  });

  it("lets a user change the trip of an asset-linked expense (not an accounting field)", async () => {
    mockStoredExpense({ trip: null, travelType: null });
    vi.mocked(Asset.find).mockResolvedValue([
      { allocatedAmount: 50, allocatedGstAmount: 0, putToUseDate: new Date("2026-11-01T00:00:00.000Z") },
    ] as never);
    vi.mocked(Trip.findById).mockReturnValue(tripOn([ownerId]) as never);

    const response = await put({ trip: goa, travelType: "visa" });

    expect(response.status).toBe(200);
    expect(storedUpdate()).toEqual(expect.objectContaining({ travelType: "visa" }));
  });
});

describe("GET /api/expenses/:id approval", () => {
  const expenseId = "66c1884c0853f8a76a4da111";

  it("populates the reviewer and who did each approval step", async () => {
    vi.clearAllMocks();
    vi.mocked(connectDB).mockResolvedValue(undefined);
    vi.mocked(verifyAuth).mockResolvedValue({
      _id: "admin-id",
      email: "admin@example.com",
      name: "Admin",
      role: "admin",
    });
    const query = {
      populate: vi.fn(() => query),
      lean: vi.fn().mockResolvedValue({ _id: expenseId, createdBy: { _id: "owner-id" }, approvalStatus: "rejected" }),
    };
    vi.mocked(Expense.findById).mockReturnValue(query as never);
    const assets = { populate: vi.fn(), sort: vi.fn(), lean: vi.fn().mockResolvedValue([]) };
    assets.populate.mockReturnValue(assets);
    assets.sort.mockReturnValue(assets);
    vi.mocked(Asset.find).mockReturnValue(assets as never);

    const response = await GET({} as NextRequest, { params: Promise.resolve({ id: expenseId }) });

    expect(response.status).toBe(200);
    expect(query.populate).toHaveBeenCalledWith("reviewedBy", "name email");
    expect(query.populate).toHaveBeenCalledWith("approvalHistory.by", "name email");
  });
});

describe("PUT /api/expenses/:id approval", () => {
  const expenseId = "66c1884c0853f8a76a4da111";
  const ownerId = "66c1884c0853f8a76a4da201";
  const objectIdLike = (value: string) => ({ toString: () => value });

  function mockStoredExpense(overrides: Record<string, unknown> = {}) {
    const stored = {
      _id: expenseId,
      title: "Taxi",
      description: "",
      createdBy: objectIdLike(ownerId),
      amount: 100,
      gstAmount: null,
      currency: objectIdLike("inr-id"),
      amountInBaseCurrency: 100,
      exchangeRateToBase: 1,
      date: new Date("2026-11-01T00:00:00.000Z"),
      category: objectIdLike("category-id"),
      department: objectIdLike("department-id"),
      paymentSource: "pocket",
      pocketAmount: 100,
      pocketAmountInBaseCurrency: 100,
      assetAllocationRevision: 4,
      approvalStatus: "approved",
      ...overrides,
    };
    vi.mocked(Expense.findById).mockResolvedValue(stored as never);
    return stored;
  }

  function signInAs(role: "user" | "admin") {
    vi.mocked(verifyAuth).mockResolvedValue({
      _id: role === "user" ? ownerId : "admin-id",
      email: `${role}@example.com`,
      name: role,
      role,
    });
  }

  function put(body: Record<string, unknown>) {
    return PUT({ json: async () => body } as unknown as NextRequest, {
      params: Promise.resolve({ id: expenseId }),
    });
  }

  function storedCall() {
    const [filter, update] = vi.mocked(Expense.findOneAndUpdate).mock.calls[0] as unknown as [
      Record<string, unknown>,
      { $set: Record<string, unknown>; $push?: Record<string, unknown>; $inc: Record<string, number> },
    ];
    return { filter, update };
  }

  const sentBack = (note: string) => ({
    approvalHistory: { action: "resubmitted", by: ownerId, at: expect.any(Date), note },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(connectDB).mockResolvedValue(undefined);
    signInAs("user");
    vi.mocked(Asset.find).mockResolvedValue([] as never);
    mockStoredExpense();
    const query = {
      populate: vi.fn(() => query),
      lean: vi.fn().mockResolvedValue({ _id: expenseId, approvalStatus: "pending" }),
    };
    vi.mocked(Expense.findOneAndUpdate).mockReturnValue(query as never);
  });

  it("sends an approved expense back for approval when its submitter changes the amount", async () => {
    const response = await put({ amount: 120 });

    expect(response.status).toBe(200);
    expect((await response.json()).expense.approvalStatus).toBe("pending");
    const { filter, update } = storedCall();
    expect(filter).toEqual({ _id: expenseId, assetAllocationRevision: 4 });
    expect(update.$set).toEqual(
      expect.objectContaining({
        amount: 120,
        approvalStatus: "pending",
        reviewedBy: null,
        reviewedAt: null,
        rejectionReason: null,
      })
    );
    expect(update.$push).toEqual(sentBack("Edited after approval"));
    expect(update.$inc).toEqual({ assetAllocationRevision: 1 });
  });

  it("treats a legacy expense without a status as approved", async () => {
    mockStoredExpense({ approvalStatus: undefined, assetAllocationRevision: undefined });

    expect((await put({ category: "other-category" })).status).toBe(200);
    const { filter, update } = storedCall();
    expect(filter).toEqual(expect.objectContaining({ $or: expect.any(Array) }));
    expect(update.$set.approvalStatus).toBe("pending");
    expect(update.$push).toEqual(sentBack("Edited after approval"));
  });

  it("keeps an approved expense approved when only the title or description changes", async () => {
    // The edit form resends every field unchanged.
    const response = await put({
      title: "Taxi to client",
      description: "Meeting",
      amount: 100,
      currency: "inr-id",
      category: "category-id",
      department: "department-id",
      date: "2026-11-01T00:00:00.000Z",
      paymentSource: "pocket",
    });

    expect(response.status).toBe(200);
    const { update } = storedCall();
    expect(update.$set).toEqual(expect.objectContaining({ title: "Taxi to client" }));
    expect(update.$set).not.toHaveProperty("approvalStatus");
    expect(update).not.toHaveProperty("$push");
    expect(update.$inc).toEqual({ assetAllocationRevision: 1 });
  });

  it("sends a rejected expense back for approval on any save by its submitter", async () => {
    mockStoredExpense({ approvalStatus: "rejected", rejectionReason: "Receipt missing", reviewedBy: "admin-id" });

    expect((await put({ title: "Taxi (receipt attached)" })).status).toBe(200);
    const { update } = storedCall();
    expect(update.$set).toEqual(
      expect.objectContaining({ approvalStatus: "pending", rejectionReason: null, reviewedBy: null })
    );
    expect(update.$push).toEqual(sentBack("Edited after rejection"));
  });

  it("never changes the status on an admin's edit", async () => {
    signInAs("admin");
    for (const approvalStatus of ["approved", "rejected", "pending"]) {
      vi.mocked(Expense.findOneAndUpdate).mockClear();
      mockStoredExpense({ approvalStatus });

      expect((await put({ amount: 250 })).status).toBe(200);
      const { update } = storedCall();
      expect(update.$set).not.toHaveProperty("approvalStatus");
      expect(update).not.toHaveProperty("$push");
    }
  });

  it("keeps a pending expense pending, still moving its revision on", async () => {
    mockStoredExpense({ approvalStatus: "pending" });

    expect((await put({ amount: 80 })).status).toBe(200);
    const { filter, update } = storedCall();
    expect(filter).toEqual({ _id: expenseId, assetAllocationRevision: 4 });
    expect(update.$set).not.toHaveProperty("approvalStatus");
    expect(update).not.toHaveProperty("$push");
    expect(update.$inc).toEqual({ assetAllocationRevision: 1 });
  });

  const STALE_EDIT =
    "This expense changed while you were editing it (for example, an admin reviewed it). Reload to see the latest version.";

  it("loses to a review that landed after the expense was read", async () => {
    // An admin rejected it (revision 4 → 5) between the read and the write.
    vi.mocked(Expense.findOneAndUpdate).mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(null),
    } as never);
    const stored = mockStoredExpense();
    vi.mocked(Expense.findById)
      .mockResolvedValueOnce(stored as never)
      .mockResolvedValueOnce({ ...stored, approvalStatus: "rejected", assetAllocationRevision: 5 } as never);

    const response = await put({ amount: 80 });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: STALE_EDIT, code: "stale", approvalStatus: "rejected" });
  });

  it("refuses an edit of an older version than the one stored, before validating or writing", async () => {
    // The form loaded revision 3; an admin approved it since (now 4).
    const response = await put({ revision: 3, amount: -5 });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: STALE_EDIT, code: "stale", approvalStatus: "approved" });
    expect(Expense.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("saves when the form's revision matches, still checking it in the write", async () => {
    const response = await put({ revision: 4, amount: 120 });

    expect(response.status).toBe(200);
    expect(storedCall().filter).toEqual({ _id: expenseId, assetAllocationRevision: 4 });
  });

  it("matches revision 0 on a legacy expense without one", async () => {
    mockStoredExpense({ assetAllocationRevision: undefined });

    expect((await put({ revision: 0, title: "Taxi" })).status).toBe(200);
    expect((await put({ revision: 1, title: "Taxi" })).status).toBe(409);
  });

  it("refuses a malformed revision", async () => {
    for (const revision of ["4", -1, 2.5]) {
      const response = await put({ revision, title: "Taxi" });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "Expense version is missing or invalid. Reload and try again.",
      });
    }
    expect(Expense.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("populates the reviewer in the response", async () => {
    await put({ title: "Taxi" });

    const query = vi.mocked(Expense.findOneAndUpdate).mock.results[0].value;
    expect(query.populate).toHaveBeenCalledWith("reviewedBy", "name email");
    expect(query.populate).toHaveBeenCalledWith("approvalHistory.by", "name email");
  });
});
