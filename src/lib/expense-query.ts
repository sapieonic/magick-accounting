import mongoose from "mongoose";
import Expense from "@/models/Expense";
import type { AuthUser } from "./auth";
import { baseTotalExpr, companyBaseExpr, paidByFilter, payerSpendPipeline, pocketBaseExpr } from "./expense";

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseDateBoundary(value: string | null, endOfDay: boolean): Date | null {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  if (endOfDay) {
    date.setUTCHours(23, 59, 59, 999);
  } else {
    date.setUTCHours(0, 0, 0, 0);
  }

  return date;
}

function toObjectId(value: string | null): mongoose.Types.ObjectId | null {
  if (!value || !mongoose.isValidObjectId(value)) return null;
  return new mongoose.Types.ObjectId(value);
}

// Collects all valid ObjectIds for a param, supporting both repeated params
// (?category=a&category=b) and comma-separated values (?category=a,b).
function toObjectIds(searchParams: URLSearchParams, key: string): mongoose.Types.ObjectId[] {
  const ids: mongoose.Types.ObjectId[] = [];
  const seen = new Set<string>();

  for (const raw of searchParams.getAll(key)) {
    for (const part of raw.split(",")) {
      const trimmed = part.trim();
      if (!trimmed || seen.has(trimmed) || !mongoose.isValidObjectId(trimmed)) continue;
      seen.add(trimmed);
      ids.push(new mongoose.Types.ObjectId(trimmed));
    }
  }

  return ids;
}

/**
 * The admin-only `paidBy` param: a person whose credited expenses to list,
 * matching how Spend by User attributes them. Ignored for role `user`.
 */
export function parsePaidByParam(
  searchParams: URLSearchParams,
  user: AuthUser
): mongoose.Types.ObjectId | null {
  if (user.role === "user") return null;
  return toObjectId(searchParams.get("paidBy"));
}

export function buildExpenseFilter(
  searchParams: URLSearchParams,
  user: AuthUser
): Record<string, unknown> {
  const filter: Record<string, unknown> = {};

  if (user.role === "user") {
    filter.createdBy = new mongoose.Types.ObjectId(user._id);
  } else {
    const requestedCreatedBy = toObjectId(searchParams.get("createdBy"));
    if (requestedCreatedBy) {
      filter.createdBy = requestedCreatedBy;
    }
  }

  const paidBy = parsePaidByParam(searchParams, user);
  if (paidBy) {
    // `$and` keeps this `$or` apart from the search `$or` below.
    filter.$and = [paidByFilter(paidBy)];
  }

  const departments = toObjectIds(searchParams, "department");
  const categories = toObjectIds(searchParams, "category");
  const search = searchParams.get("search")?.trim();
  const from = parseDateBoundary(searchParams.get("from"), false);
  const to = parseDateBoundary(searchParams.get("to"), true);

  if (departments.length === 1) filter.department = departments[0];
  else if (departments.length > 1) filter.department = { $in: departments };

  if (categories.length === 1) filter.category = categories[0];
  else if (categories.length > 1) filter.category = { $in: categories };

  // `trip=<id>` lists one trip's expenses; `trip=none` those in no trip.
  const tripParam = searchParams.get("trip");
  if (tripParam === "none") {
    filter.trip = null;
  } else {
    const trip = toObjectId(tripParam);
    if (trip) filter.trip = trip;
  }

  if (search) {
    const regex = new RegExp(escapeRegExp(search), "i");
    filter.$or = [{ title: regex }, { description: regex }];
  }

  if (from || to) {
    filter.date = {
      ...(from ? { $gte: from } : {}),
      ...(to ? { $lte: to } : {}),
    };
  }

  return filter;
}

export interface PayerSpend {
  totalSpend: number;
  pocketSpend: number;
  companySpend: number;
}

export async function getExpenseSummary(
  filter: Record<string, unknown>,
  paidBy: mongoose.Types.ObjectId | null = null
) {
  const [[summary], payerRows] = await Promise.all([
    Expense.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalExpenses: { $sum: 1 },
          totalAmount: { $sum: baseTotalExpr },
          // Company vs pocket, with the legacy fallbacks every aggregation uses.
          companyAmount: { $sum: companyBaseExpr },
          pocketAmount: { $sum: pocketBaseExpr },
        },
      },
    ]),
    paidBy ? Expense.aggregate(payerSpendPipeline(filter, paidBy)) : Promise.resolve(null),
  ]);

  const payerSpend: PayerSpend | null = payerRows
    ? {
        totalSpend: payerRows[0]?.totalSpend ?? 0,
        pocketSpend: payerRows[0]?.pocketSpend ?? 0,
        companySpend: payerRows[0]?.companySpend ?? 0,
      }
    : null;

  return {
    totalExpenses: summary?.totalExpenses ?? 0,
    totalAmount: summary?.totalAmount ?? 0,
    companyAmount: summary?.companyAmount ?? 0,
    pocketAmount: summary?.pocketAmount ?? 0,
    // With a payer filter: that person's own share, as Spend by User counts it.
    ...(payerSpend ? { payerSpend } : {}),
  };
}

export interface ExpensePageParams {
  page: number;
  limit: number;
  /** Items to skip: `offset` when given, else the pages before `page`. */
  skip: number;
}

/** A whole number of at least `min` from a query param, else null. */
function intParam(value: string | null, min: number): number | null {
  const parsed = value === null || value.trim() === "" ? NaN : Number(value);
  return Number.isInteger(parsed) && parsed >= min ? parsed : null;
}

/**
 * `page` / `limit` of the expense list, or `offset` / `limit`. A client that
 * deletes rows between pages asks by `offset` (the items it has loaded, less
 * the ones it deleted), since every later item has moved up by then.
 */
export function parseExpensePageParams(searchParams: URLSearchParams): ExpensePageParams {
  const page = intParam(searchParams.get("page"), 1) ?? 1;
  const limit = intParam(searchParams.get("limit"), 1) ?? 20;
  const skip = intParam(searchParams.get("offset"), 0) ?? (page - 1) * limit;
  return { page, limit, skip };
}

/**
 * The `pagination` block of the expense list: `nextOffset` is where the next
 * page starts and `hasMore` whether there is one, both counted in items (a
 * trip is one item in the grouped list, however many rows it shows as).
 */
export function expensePagination({ page, limit, skip }: ExpensePageParams, count: number, total: number) {
  return {
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
    offset: skip,
    nextOffset: skip + count,
    hasMore: skip + count < total,
  };
}

/**
 * Pipeline paginating the expenses matching `filter` as list *items*: every
 * trip's matching expenses form one item, every other expense is its own.
 * Items are ordered by their latest expense date, newest first. Returns one
 * document `{ items: [{ _id, ids }], total: [{ count }] }`, where `ids` are
 * the item's expense ids. A trip item's `_id` is the trip id, any other
 * item's the expense id; a trip's expenses therefore always share a page.
 */
export function groupedExpensePagePipeline(
  filter: Record<string, unknown>,
  skip: number,
  limit: number
) {
  return [
    { $match: filter },
    {
      $group: {
        // Missing or null `trip` falls back to the expense's own id.
        _id: { $ifNull: ["$trip", "$_id"] },
        latestDate: { $max: "$date" },
        latestCreatedAt: { $max: "$createdAt" },
        ids: { $push: "$_id" },
      },
    },
    { $sort: { latestDate: -1, latestCreatedAt: -1, _id: -1 } },
    {
      $facet: {
        items: [{ $skip: skip }, { $limit: limit }, { $project: { ids: 1 } }],
        total: [{ $count: "count" }],
      },
    },
  ];
}
