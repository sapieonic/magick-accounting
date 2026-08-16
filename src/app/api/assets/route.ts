import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { calculateAssetBookValue, getDepreciationAsOfDate } from "@/lib/asset";
import { connectDB } from "@/lib/mongodb";
import Asset, { ASSET_STATUSES } from "@/models/Asset";
import mongoose from "mongoose";
import "@/models/Expense";
import "@/models/Department";
import "@/models/User";
import "@/models/Currency";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function positiveInteger(value: string | null, fallback: number): number | null {
  if (value == null) return fallback;
  if (!/^\d+$/.test(value) || Number(value) < 1) return null;
  return Number(value);
}

export async function GET(req: NextRequest) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  await connectDB();
  const { searchParams } = new URL(req.url);
  const requestedPage = positiveInteger(searchParams.get("page"), 1);
  const requestedLimit = positiveInteger(searchParams.get("limit"), 25);
  if (requestedPage == null) {
    return NextResponse.json({ error: "Page must be a positive integer" }, { status: 400 });
  }
  if (requestedLimit == null) {
    return NextResponse.json({ error: "Limit must be a positive integer" }, { status: 400 });
  }
  const page = requestedPage;
  const limit = Math.min(100, requestedLimit);
  const search = searchParams.get("search")?.trim();
  const status = searchParams.get("status")?.trim();
  const category = searchParams.get("category")?.trim();
  const assignedTo = searchParams.get("assignedTo")?.trim();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = {};
  if (authResult.role === "user") {
    filter.assignedTo = new mongoose.Types.ObjectId(authResult._id);
  } else if (assignedTo) {
    if (!mongoose.isValidObjectId(assignedTo)) {
      return NextResponse.json({ error: "Assignee filter is invalid" }, { status: 400 });
    }
    filter.assignedTo = new mongoose.Types.ObjectId(assignedTo);
  }
  if (status) {
    if (!ASSET_STATUSES.includes(status as (typeof ASSET_STATUSES)[number])) {
      return NextResponse.json({ error: "Status filter is invalid" }, { status: 400 });
    }
    filter.status = status;
  }
  if (category) filter.assetCategory = category;
  if (search) {
    const regex = new RegExp(escapeRegex(search), "i");
    filter.$or = [
      { assetTag: regex },
      { name: regex },
      { serialNumber: regex },
      { make: regex },
      { assetModel: regex },
    ];
  }

  const [assets, total, categories, summary] = await Promise.all([
    Asset.find(filter)
      .populate("assignedTo", "name email photoURL")
      .populate("department", "name")
      .populate({
        path: "purchaseExpense",
        select: "title amount gstAmount date receiptKey receiptFilename currency createdBy",
        populate: { path: "currency", select: "code name symbol isBase" },
      })
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Asset.countDocuments(filter),
    Asset.distinct(
      "assetCategory",
      authResult.role === "user"
        ? { assignedTo: new mongoose.Types.ObjectId(authResult._id) }
        : {}
    ),
    Asset.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          activeAssets: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
          totalCapitalizedCost: { $sum: "$capitalizedCostInBaseCurrency" },
          unassignedAssets: { $sum: { $cond: [{ $eq: [{ $ifNull: ["$assignedTo", null] }, null] }, 1, 0] } },
        },
      },
    ]),
  ]);

  const asOfDate = new Date();
  const assetsWithBookValue = assets.map((asset) => {
    const purchaseExpense = asset.purchaseExpense as unknown as Record<string, unknown> | null;
    const canViewFinancials =
      authResult.role !== "user" || String(purchaseExpense?.createdBy || "") === authResult._id;
    const valuation = calculateAssetBookValue(
      asset.capitalizedCost,
      asset.residualValue,
      asset.depreciationMethod,
      asset.depreciationRate,
      asset.putToUseDate,
      getDepreciationAsOfDate(asset.status, asset.lifecycleDate, asset.updatedAt, asOfDate)
    );
    const result = { ...asset, ...valuation, canViewFinancials } as Record<string, unknown>;
    if (purchaseExpense) {
      const visiblePurchase = { ...purchaseExpense };
      delete visiblePurchase.createdBy;
      if (!canViewFinancials) {
        delete visiblePurchase.amount;
        delete visiblePurchase.gstAmount;
        delete visiblePurchase.receiptKey;
        delete visiblePurchase.receiptFilename;
      }
      result.purchaseExpense = visiblePurchase;
    }
    if (!canViewFinancials) {
      [
        "allocatedAmount",
        "allocatedGstAmount",
        "recoverableGstAmount",
        "capitalizedCost",
        "allocatedAmountInBaseCurrency",
        "capitalizedCostInBaseCurrency",
        "residualValue",
        "depreciationMethod",
        "depreciationRate",
        "accumulatedDepreciation",
        "bookValue",
      ].forEach((field) => delete result[field]);
    }
    return result;
  });
  return NextResponse.json({
    assets: assetsWithBookValue,
    categories: categories.sort(),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    summary:
      authResult.role === "user"
        ? {
            activeAssets: summary[0]?.activeAssets || 0,
            unassignedAssets: 0,
          }
        : summary[0] || { activeAssets: 0, totalCapitalizedCost: 0, unassignedAssets: 0 },
  });
}
