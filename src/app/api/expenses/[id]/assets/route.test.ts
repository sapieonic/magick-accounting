import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyAuth } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { createAssetsForExpense } from "@/lib/asset-server";
import Expense from "@/models/Expense";
import Asset from "@/models/Asset";

vi.mock("@/lib/auth", () => ({ verifyAuth: vi.fn() }));
vi.mock("@/lib/mongodb", () => ({ connectDB: vi.fn() }));
vi.mock("@/lib/mongodb-transaction", () => ({
  runInTransaction: vi.fn((work) => work(null, true)),
}));
vi.mock("@/lib/asset-server", () => ({
  compensateAssetCreation: vi.fn(),
  createAssetsForExpense: vi.fn(),
  ensureAssetIndexes: vi.fn(),
}));
vi.mock("@/models/Expense", () => ({ default: { findById: vi.fn() } }));
vi.mock("@/models/Asset", () => ({ default: { find: vi.fn() } }));
vi.mock("@/models/Department", () => ({ default: {} }));
vi.mock("@/models/User", () => ({ default: {} }));

describe("POST /api/expenses/:id/assets approval", () => {
  const expenseId = "66c1884c0853f8a76a4da111";
  const ownerId = "66c1884c0853f8a76a4da201";

  function chain(result: unknown) {
    const query = {
      select: vi.fn(() => query),
      populate: vi.fn(() => query),
      sort: vi.fn(() => query),
      lean: vi.fn().mockResolvedValue(result),
    };
    return query;
  }

  function mockStoredExpense(overrides: Record<string, unknown> = {}) {
    vi.mocked(Expense.findById).mockResolvedValue({
      _id: expenseId,
      createdBy: { toString: () => ownerId },
      amount: 1000,
      amountInBaseCurrency: 1000,
      exchangeRateToBase: 1,
      assetAllocationRevision: 2,
      ...overrides,
    } as never);
  }

  function signInAs(role: "user" | "admin") {
    vi.mocked(verifyAuth).mockResolvedValue({
      _id: role === "user" ? ownerId : "admin-id",
      email: `${role}@example.com`,
      name: role,
      role,
    });
  }

  function post() {
    return POST({ json: async () => ({ assets: [{ name: "Chair" }] }) } as unknown as NextRequest, {
      params: Promise.resolve({ id: expenseId }),
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(connectDB).mockResolvedValue(undefined);
    vi.mocked(Asset.find).mockReturnValue(chain([]) as never);
  });

  it("tells a user assets wait for approval", async () => {
    signInAs("user");
    mockStoredExpense({ approvalStatus: "pending" });

    const response = await post();

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Assets can be registered once an admin approves this expense.",
      code: "not_approved",
      approvalStatus: "pending",
    });
    expect(createAssetsForExpense).not.toHaveBeenCalled();
  });

  it("tells an admin to approve a pending expense first, and refuses a rejected one", async () => {
    signInAs("admin");
    mockStoredExpense({ approvalStatus: "pending" });
    const pending = await post();
    expect(pending.status).toBe(409);
    expect((await pending.json()).error).toBe(
      "This expense is awaiting approval. Approve it first, then add its assets."
    );

    mockStoredExpense({ approvalStatus: "rejected" });
    const rejected = await post();
    expect(rejected.status).toBe(409);
    expect((await rejected.json()).error).toBe(
      "This expense was rejected. Assets can only be added to approved expenses."
    );
    expect(createAssetsForExpense).not.toHaveBeenCalled();
  });

  it("adds assets to approved and legacy expenses", async () => {
    signInAs("admin");
    for (const approvalStatus of ["approved", undefined]) {
      mockStoredExpense({ approvalStatus });
      expect((await post()).status).toBe(201);
    }
    expect(createAssetsForExpense).toHaveBeenCalledTimes(2);
  });
});
