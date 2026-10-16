import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { buildExpenseFilter } from "@/lib/expense-query";
import { companyBaseExpr, pocketBaseExpr } from "@/lib/expense";
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

interface PaymentSourceTotals {
  pocketTotal?: number;
  pocketCount?: number;
  companyTotal?: number;
  companyCount?: number;
}

function buildPaymentSourceRows(
  totals: PaymentSourceTotals | undefined
): { name: "pocket" | "company"; total: number; count: number }[] {
  const rows = [
    { name: "pocket" as const, total: totals?.pocketTotal ?? 0, count: totals?.pocketCount ?? 0 },
    { name: "company" as const, total: totals?.companyTotal ?? 0, count: totals?.companyCount ?? 0 },
  ];
  return rows.filter((row) => row.count > 0).sort((a, b) => b.total - a.total);
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
    // A split expense contributes its share to both sides, so the per-side
    // counts can add up to more than the number of expenses. Counts go by
    // source rather than share, so zero-amount expenses are still counted;
    // an expense paid by several people counts on each side it has a payment.
    Expense.aggregate([
      { $match: filter },
      {
        $project: {
          paymentSource: 1,
          pocket: pocketBaseExpr,
          company: companyBaseExpr,
          hasPocketEntry: { $in: ["pocket", { $ifNull: ["$payments.source", []] }] },
          hasCompanyEntry: { $in: ["company", { $ifNull: ["$payments.source", []] }] },
        },
      },
      {
        $group: {
          _id: null,
          pocketTotal: { $sum: "$pocket" },
          pocketCount: {
            $sum: {
              $cond: [
                {
                  $cond: [
                    { $eq: ["$paymentSource", "multiple"] },
                    "$hasPocketEntry",
                    { $ne: ["$paymentSource", "company"] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          companyTotal: { $sum: "$company" },
          companyCount: {
            $sum: {
              $cond: [
                {
                  $or: [
                    { $in: ["$paymentSource", ["company", "split"]] },
                    { $and: [{ $eq: ["$paymentSource", "multiple"] }, "$hasCompanyEntry"] },
                  ],
                },
                1,
                0,
              ],
            },
          },
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

  const paymentSources = buildPaymentSourceRows(paymentSourceRows[0]);

  const monthlyTrend = buckets.map((b) => ({
    month: b.label,
    key: b.key,
    total: trendMap.get(b.key)?.total ?? 0,
    count: trendMap.get(b.key)?.count ?? 0,
  }));

  return NextResponse.json({
    monthlyTrend,
    topCategories: categoryRows,
    paymentSources,
    departmentSpend: departmentSpendRows,
  });
}
