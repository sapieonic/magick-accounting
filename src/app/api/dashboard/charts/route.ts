import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { buildExpenseFilter } from "@/lib/expense-query";
import Expense from "@/models/Expense";
import "@/models/Category";
import "@/models/Department";

const TREND_MONTHS = 6;
const TOP_CATEGORIES = 6;

interface DateRangeFilter {
  $gte?: Date;
  $lte?: Date;
  $lt?: Date;
}

function getDateBoundary(value: unknown): Date | undefined {
  return value instanceof Date ? value : undefined;
}

function buildTrendDateFilter(
  existingDateFilter: unknown,
  trendStart: Date,
  trendEnd: Date
): DateRangeFilter {
  const existing =
    existingDateFilter && typeof existingDateFilter === "object"
      ? (existingDateFilter as DateRangeFilter)
      : {};
  const existingStart = getDateBoundary(existing.$gte);
  const existingEnd = getDateBoundary(existing.$lte);
  const existingExclusiveEnd = getDateBoundary(existing.$lt);

  return {
    $gte: existingStart && existingStart > trendStart ? existingStart : trendStart,
    ...(existingEnd ? { $lte: existingEnd } : {}),
    $lt: existingExclusiveEnd && existingExclusiveEnd < trendEnd ? existingExclusiveEnd : trendEnd,
  };
}

function buildMonthBuckets(): { key: string; label: string; start: Date; end: Date }[] {
  const now = new Date();
  const buckets: { key: string; label: string; start: Date; end: Date }[] = [];
  for (let i = TREND_MONTHS - 1; i >= 0; i--) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 1));
    const key = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
    const label = start.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
    buckets.push({ key, label, start, end });
  }
  return buckets;
}

export async function GET(req: NextRequest) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  await connectDB();
  const filter = buildExpenseFilter(new URL(req.url).searchParams, authResult);

  const buckets = buildMonthBuckets();
  const trendStart = buckets[0].start;
  const trendEnd = buckets[buckets.length - 1].end;

  const trendFilter = {
    ...filter,
    date: buildTrendDateFilter(filter.date, trendStart, trendEnd),
  };

  const [trendRows, categoryRows, paymentSourceRows, departmentSpendRows] = await Promise.all([
    Expense.aggregate([
      { $match: trendFilter },
      {
        $group: {
          _id: { y: { $year: "$date" }, m: { $month: "$date" } },
          total: { $sum: { $ifNull: ["$amountInBaseCurrency", "$amount"] } },
          count: { $sum: 1 },
        },
      },
    ]),
    Expense.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$category",
          total: { $sum: { $ifNull: ["$amountInBaseCurrency", "$amount"] } },
          count: { $sum: 1 },
        },
      },
      { $sort: { total: -1 } },
      { $limit: TOP_CATEGORIES },
      {
        $lookup: {
          from: "categories",
          localField: "_id",
          foreignField: "_id",
          as: "category",
        },
      },
      { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: { $ifNull: ["$category._id", null] },
          name: { $ifNull: ["$category.name", "Uncategorized"] },
          total: 1,
          count: 1,
        },
      },
    ]),
    Expense.aggregate([
      { $match: filter },
      {
        $group: {
          _id: { $cond: [{ $eq: ["$paymentSource", "company"] }, "company", "pocket"] },
          total: { $sum: { $ifNull: ["$amountInBaseCurrency", "$amount"] } },
          count: { $sum: 1 },
        },
      },
      { $sort: { total: -1 } },
      {
        $project: {
          name: "$_id",
          total: 1,
          count: 1,
        },
      },
    ]),
    Expense.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$department",
          total: { $sum: { $ifNull: ["$amountInBaseCurrency", "$amount"] } },
          count: { $sum: 1 },
        },
      },
      { $sort: { total: -1 } },
      { $limit: TOP_CATEGORIES },
      {
        $lookup: {
          from: "departments",
          localField: "_id",
          foreignField: "_id",
          as: "department",
        },
      },
      { $unwind: { path: "$department", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: { $ifNull: ["$department._id", null] },
          name: { $ifNull: ["$department.name", "Unknown"] },
          total: 1,
          count: 1,
        },
      },
    ]),
  ]);

  const trendMap = new Map<string, { total: number; count: number }>();
  for (const row of trendRows) {
    const key = `${row._id.y}-${String(row._id.m).padStart(2, "0")}`;
    trendMap.set(key, { total: row.total, count: row.count });
  }

  const monthlyTrend = buckets.map((b) => ({
    month: b.label,
    key: b.key,
    total: trendMap.get(b.key)?.total ?? 0,
    count: trendMap.get(b.key)?.count ?? 0,
  }));

  return NextResponse.json({
    monthlyTrend,
    topCategories: categoryRows,
    paymentSources: paymentSourceRows,
    departmentSpend: departmentSpendRows,
  });
}
