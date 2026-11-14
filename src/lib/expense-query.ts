import mongoose from "mongoose";
import Expense from "@/models/Expense";
import type { AuthUser } from "./auth";
import {
  baseTotalExpr,
  companyBaseExpr,
  MAX_EXPENSE_PAGE,
  paidByFilter,
  payerSpendPipeline,
  pocketBaseExpr,
} from "./expense";

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

/**
 * Where a page of the expense list continues: the sort key of the last item
 * already sent. Both lists sort newest first by date, then entry time, then
 * id, which orders every item exactly; the next page starts strictly after
 * this key, so deleting loaded rows never makes it skip one.
 */
export interface ExpenseCursor {
  date: Date;
  /** `null` for documents without an entry time (they sort last within their day). */
  createdAt: Date | null;
  id: mongoose.Types.ObjectId;
}

/** The sort shared by the flat list (on expenses) and the grouped one (on items). */
export const EXPENSE_LIST_SORT = { date: -1, createdAt: -1, _id: -1 } as const;

/** The fields of an expense (or grouped item) its cursor is made from. */
interface CursorKey {
  /** Required on expenses; optional here only because lean query results don't type it. */
  date?: unknown;
  createdAt?: unknown;
  _id: unknown;
}

const OBJECT_ID = /^[0-9a-f]{24}$/i;

export function encodeExpenseCursor(key: CursorKey): string {
  const createdAt = key.createdAt ? new Date(key.createdAt as string | Date).toISOString() : null;
  const payload = [new Date(key.date as string | Date).toISOString(), createdAt, String(key._id)];
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

/** The cursor a client sent back, or `null` when it isn't one this API made. */
export function decodeExpenseCursor(value: string): ExpenseCursor | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length !== 3) return null;
  const [date, createdAt, id] = parsed;
  if (typeof date !== "string" || (createdAt !== null && typeof createdAt !== "string")) return null;
  if (typeof id !== "string" || !OBJECT_ID.test(id)) return null;
  const cursor: ExpenseCursor = {
    date: new Date(date),
    createdAt: createdAt === null ? null : new Date(createdAt),
    id: new mongoose.Types.ObjectId(id),
  };
  const invalid = (d: Date | null) => d !== null && Number.isNaN(d.getTime());
  return invalid(cursor.date) || invalid(cursor.createdAt) ? null : cursor;
}

/**
 * Query for the expenses (or grouped items) sorting after `cursor` in
 * `EXPENSE_LIST_SORT` order. A missing entry time sorts lowest, and query
 * comparisons don't match across types, so it is matched explicitly.
 */
export function afterCursorFilter({ date, createdAt, id }: ExpenseCursor): Record<string, unknown> {
  return {
    $or: [
      { date: { $lt: date } },
      ...(createdAt ? [{ date, createdAt: { $lt: createdAt } }, { date, createdAt: null }] : []),
      { date, createdAt, _id: { $lt: id } },
    ],
  };
}

export interface ExpensePageParams {
  limit: number;
  /** Continue after this item; `null` for the first page. */
  cursor: ExpenseCursor | null;
}

/** A whole number of at least `min` from a query param, else null. */
function intParam(value: string | null, min: number): number | null {
  const parsed = value === null || value.trim() === "" ? NaN : Number(value);
  return Number.isInteger(parsed) && parsed >= min ? parsed : null;
}

/**
 * `limit` (default 20, at most `MAX_EXPENSE_PAGE`) and `cursor` of the expense
 * list. `null` when a cursor is given but malformed, so the caller can refuse
 * it rather than restart.
 */
export function parseExpensePageParams(searchParams: URLSearchParams): ExpensePageParams | null {
  const limit = Math.min(intParam(searchParams.get("limit"), 1) ?? 20, MAX_EXPENSE_PAGE);
  const rawCursor = searchParams.get("cursor");
  if (!rawCursor) return { limit, cursor: null };
  const cursor = decodeExpenseCursor(rawCursor);
  return cursor ? { limit, cursor } : null;
}

/**
 * The `pagination` block of the expense list. Pages are fetched one row over
 * `limit`, so `rows` may hold one more than is sent: that extra row only says
 * there is a next page. `nextCursor` (sent back as `cursor`) continues after
 * the last row sent. `total` counts items (a trip is one in the grouped list);
 * only the first page counts them, so it is `null` on pages after a cursor.
 */
export function expensePagination<T extends CursorKey>(rows: T[], limit: number, total: number | null) {
  const page = rows.slice(0, limit);
  const hasMore = rows.length > limit;
  const last = page[page.length - 1];
  return {
    page,
    pagination: {
      total,
      hasMore,
      nextCursor: hasMore && last ? encodeExpenseCursor(last) : null,
    },
  };
}

/**
 * Pipeline paginating the expenses matching `filter` as list *items*: every
 * trip's matching expenses form one item, every other expense is its own.
 * Items are ordered like the flat list (`EXPENSE_LIST_SORT`) by their latest
 * expense. Returns one document `{ items: [{ _id, ids, date, createdAt }],
 * total: [{ count }] }`: up to `limit + 1` items after `cursor` (the extra
 * one says there is a next page), and, on the first page only (no `cursor`),
 * the count of all items. `ids` are the
 * item's expense ids; a trip item's `_id` is the trip id, any other item's
 * the expense id, so a trip's expenses always share a page.
 */
export function groupedExpensePagePipeline(
  filter: Record<string, unknown>,
  cursor: ExpenseCursor | null,
  limit: number
) {
  return [
    { $match: filter },
    {
      $group: {
        // Missing or null `trip` falls back to the expense's own id.
        _id: { $ifNull: ["$trip", "$_id"] },
        date: { $max: "$date" },
        createdAt: { $max: "$createdAt" },
        ids: { $push: "$_id" },
      },
    },
    { $sort: EXPENSE_LIST_SORT },
    {
      $facet: {
        items: [
          ...(cursor ? [{ $match: afterCursorFilter(cursor) }] : []),
          { $limit: limit + 1 },
        ],
        // Only the first page reports a total, so later pages skip counting.
        ...(cursor ? {} : { total: [{ $count: "count" }] }),
      },
    },
  ];
}
