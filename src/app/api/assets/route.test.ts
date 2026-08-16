import mongoose from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { verifyAuth } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Asset from "@/models/Asset";

vi.mock("@/lib/auth", () => ({ verifyAuth: vi.fn() }));
vi.mock("@/lib/mongodb", () => ({ connectDB: vi.fn() }));
vi.mock("@/models/Asset", () => ({
  ASSET_STATUSES: ["active", "under_repair", "retired", "sold", "lost", "disposed"],
  default: {
    find: vi.fn(),
    countDocuments: vi.fn(),
    distinct: vi.fn(),
    aggregate: vi.fn(),
  },
}));
vi.mock("@/models/Expense", () => ({ default: {} }));
vi.mock("@/models/Department", () => ({ default: {} }));
vi.mock("@/models/User", () => ({ default: {} }));
vi.mock("@/models/Currency", () => ({ default: {} }));
vi.mock("@/models/AssetEvent", () => ({ default: {} }));

function mockAssetFind(rows: unknown[]) {
  const query = {
    populate: vi.fn(),
    sort: vi.fn(),
    skip: vi.fn(),
    limit: vi.fn(),
    lean: vi.fn().mockResolvedValue(rows),
  };
  query.populate.mockReturnValue(query);
  query.sort.mockReturnValue(query);
  query.skip.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  vi.mocked(Asset.find).mockReturnValue(query as never);
}

describe("GET /api/assets", () => {
  const userId = new mongoose.Types.ObjectId().toString();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(connectDB).mockResolvedValue(undefined);
    vi.mocked(verifyAuth).mockResolvedValue({
      _id: userId,
      email: "user@example.com",
      name: "User",
      role: "user",
    });
  });

  it("returns a JSON 400 for malformed pagination", async () => {
    const invalidText = await GET({ url: "http://localhost/api/assets?page=abc" } as NextRequest);
    const partiallyNumeric = await GET({ url: "http://localhost/api/assets?page=1oops" } as NextRequest);
    expect(invalidText.status).toBe(400);
    expect(partiallyNumeric.status).toBe(400);
    expect(Asset.find).not.toHaveBeenCalled();
  });

  it("redacts financials and receipt keys from a non-owner assignee", async () => {
    mockAssetFind([
      {
        _id: new mongoose.Types.ObjectId(),
        assetTag: "AST-2026-TEST",
        name: "Laptop",
        capitalizedCost: 100000,
        residualValue: 0,
        depreciationMethod: "straight_line",
        depreciationRate: 20,
        putToUseDate: new Date("2026-04-01"),
        lifecycleDate: null,
        purchaseExpense: {
          _id: new mongoose.Types.ObjectId(),
          title: "Laptop invoice",
          amount: 118000,
          gstAmount: 18000,
          receiptKey: "receipts/admin/private.pdf",
          receiptFilename: "private.pdf",
          createdBy: new mongoose.Types.ObjectId(),
        },
      },
    ]);
    vi.mocked(Asset.countDocuments).mockResolvedValue(1);
    vi.mocked(Asset.distinct).mockResolvedValue(["Computer & Laptop"]);
    vi.mocked(Asset.aggregate).mockResolvedValue([
      { activeAssets: 1, totalCapitalizedCost: 100000, unassignedAssets: 0 },
    ]);

    const response = await GET({ url: "http://localhost/api/assets" } as NextRequest);
    const data = await response.json();
    expect(data.assets[0].canViewFinancials).toBe(false);
    expect(data.assets[0].capitalizedCost).toBeUndefined();
    expect(data.assets[0].bookValue).toBeUndefined();
    expect(data.assets[0].purchaseExpense.amount).toBeUndefined();
    expect(data.assets[0].purchaseExpense.receiptKey).toBeUndefined();
    expect(data.summary.totalCapitalizedCost).toBeUndefined();
  });
});
