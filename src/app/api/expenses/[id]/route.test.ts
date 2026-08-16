import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { DELETE } from "./route";
import { verifyAuth } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { deleteObject } from "@/lib/s3";
import Expense from "@/models/Expense";
import Asset from "@/models/Asset";

vi.mock("@/lib/auth", () => ({ verifyAuth: vi.fn() }));
vi.mock("@/lib/mongodb", () => ({ connectDB: vi.fn() }));
vi.mock("@/lib/s3", () => ({ deleteObject: vi.fn() }));
vi.mock("@/models/Expense", () => ({
  default: { findById: vi.fn(), deleteOne: vi.fn() },
}));
vi.mock("@/models/Asset", () => ({
  default: { find: vi.fn(), countDocuments: vi.fn() },
}));
vi.mock("@/models/Currency", () => ({ default: {} }));
vi.mock("@/models/Category", () => ({ default: {} }));
vi.mock("@/models/Department", () => ({ default: {} }));
vi.mock("@/models/User", () => ({ default: {} }));

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
