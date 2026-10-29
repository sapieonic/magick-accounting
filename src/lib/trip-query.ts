import mongoose, { type PipelineStage } from "mongoose";
import type { AuthUser } from "@/lib/auth";
import { roundMoney } from "@/lib/asset";
import { baseTotalExpr, companyBaseExpr, pocketBaseExpr, spendByPayerPipeline } from "@/lib/expense";
import { buildExpenseFilter, groupedExpensePagePipeline } from "@/lib/expense-query";
import { getTripStatus, totalsByTravelType, type TravelType } from "@/lib/trip";
import { canManageTrip, TRIP_TRAVELER_FIELDS } from "@/lib/trip-server";
import Expense from "@/models/Expense";
import Asset from "@/models/Asset";
import Trip from "@/models/Trip";
import User from "@/models/User";
import "@/models/Category";
import "@/models/Department";
import "@/models/Currency";
import type {
  TripDetailSummary,
  TripListItem,
  TripPayerTotal,
  TripPerson,
  TripSummary,
} from "@/types/trip";

// Lean Mongo documents; their shape is described by the serializers below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LeanDoc = any;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isoDate(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

// ---------------------------------------------------------------------------
// Expenses

/**
 * The refs every expense the client lists is populated with, so the trip
 * endpoints and the grouped expense list return the same shape as
 * `GET /api/expenses` (`ExpenseListItem`).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function populateExpenseRefs<Q extends { populate: (...args: any[]) => any }>(query: Q): Q {
  return query
    .populate("category", "name")
    .populate("department", "name")
    .populate("currency", "code name symbol rateToBase isBase")
    .populate("createdBy", "name email photoURL")
    .populate("payments.paidBy", "name email")
    .populate("trip", "name");
}

/** Adds `linkedAssetCount` (assets bought through each expense) to listed expenses. */
export async function withLinkedAssetCounts<T extends { _id: unknown }>(
  expenses: T[]
): Promise<(T & { linkedAssetCount: number })[]> {
  const expenseIds = expenses.map((expense) => expense._id);
  const rows: { _id: unknown; count: number }[] =
    expenseIds.length > 0
      ? await Asset.aggregate([
          { $match: { purchaseExpense: { $in: expenseIds } } },
          { $group: { _id: "$purchaseExpense", count: { $sum: 1 } } },
        ])
      : [];
  const countByExpense = new Map(rows.map((row) => [String(row._id), row.count]));
  return expenses.map((expense) => ({
    ...expense,
    linkedAssetCount: countByExpense.get(String(expense._id)) || 0,
  }));
}

/**
 * The expenses of one trip the caller may see: the same rules as the expense
 * list (`user` role: only their own), narrowed to the trip.
 */
export function tripExpenseFilter(tripId: string, user: AuthUser): Record<string, unknown> {
  return buildExpenseFilter(new URLSearchParams({ trip: tripId }), user);
}

/** Oldest first; same-day expenses in the order they were entered. */
export const TRIP_EXPENSE_SORT = { date: 1, createdAt: 1, _id: 1 } as const;

function compareTripExpenses(a: LeanDoc, b: LeanDoc): number {
  const byDate = new Date(a.date).getTime() - new Date(b.date).getTime();
  if (byDate !== 0) return byDate;
  const byCreated = new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime();
  if (byCreated !== 0) return byCreated;
  return String(a._id).localeCompare(String(b._id));
}

// ---------------------------------------------------------------------------
// Trips

/** Populates what `serializeTripSummary` / `serializeTripListItem` read. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function populateTripRefs<Q extends { populate: (...args: any[]) => any }>(query: Q): Q {
  return query
    .populate("travelers", TRIP_TRAVELER_FIELDS)
    .populate("createdBy", TRIP_TRAVELER_FIELDS)
    .populate("department", "name");
}

export function tripPerson(user: LeanDoc | null | undefined): TripPerson {
  if (!user || typeof user !== "object" || !("email" in user)) {
    // A deleted user, or an unpopulated id.
    return { _id: user ? String(user._id ?? user) : "", name: "Unknown user", email: "" };
  }
  return {
    _id: String(user._id),
    name: user.name || user.email,
    email: user.email,
    ...(user.photoURL ? { photoURL: user.photoURL } : {}),
  };
}

export function serializeTripSummary(trip: LeanDoc, now: Date = new Date()): TripSummary {
  return {
    _id: String(trip._id),
    name: trip.name,
    destinations: trip.destinations ?? [],
    startDate: isoDate(trip.startDate),
    endDate: isoDate(trip.endDate),
    travelers: (trip.travelers ?? []).filter(Boolean).map(tripPerson),
    status: getTripStatus(trip, now),
  };
}

export interface TripTotals {
  expenseCount: number;
  totalAmount: number;
}

const NO_TOTALS: TripTotals = { expenseCount: 0, totalAmount: 0 };

export function serializeTripListItem(
  trip: LeanDoc,
  totals: TripTotals | undefined,
  user: AuthUser,
  now: Date = new Date()
): TripListItem {
  const department =
    trip.department && typeof trip.department === "object" && "name" in trip.department
      ? { _id: String(trip.department._id), name: trip.department.name }
      : null;
  return {
    ...serializeTripSummary(trip, now),
    purpose: trip.purpose ?? "",
    department,
    budget: trip.budget ?? null,
    notes: trip.notes ?? "",
    createdBy: tripPerson(trip.createdBy),
    expenseCount: totals?.expenseCount ?? 0,
    totalAmount: roundMoney(totals?.totalAmount ?? 0),
    canManage: canManageTrip(trip, user),
  };
}

/** `GET /api/trips?q=`: trips whose name or a destination contains `q`. */
export function tripSearchFilter(
  access: Record<string, unknown>,
  q: string | null | undefined
): Record<string, unknown> {
  const term = q?.trim();
  if (!term) return access;
  const regex = new RegExp(escapeRegExp(term), "i");
  const search = { $or: [{ name: regex }, { destinations: regex }] };
  return Object.keys(access).length > 0 ? { $and: [access, search] } : search;
}

/** Per-trip count and base-currency total of the expenses matching `visibility`. */
export function tripTotalsPipeline(
  visibility: Record<string, unknown>,
  tripIds: mongoose.Types.ObjectId[]
): PipelineStage[] {
  return [
    { $match: { ...visibility, trip: { $in: tripIds } } },
    {
      $group: {
        _id: "$trip",
        expenseCount: { $sum: 1 },
        totalAmount: { $sum: baseTotalExpr },
      },
    },
  ];
}

/**
 * Totals of the expenses the caller can see in each trip (`user` role: their
 * own), keyed by trip id.
 */
export async function visibleTripTotals(
  tripIds: unknown[],
  user: AuthUser
): Promise<Map<string, TripTotals>> {
  if (tripIds.length === 0) return new Map();
  const visibility = buildExpenseFilter(new URLSearchParams(), user);
  const ids = tripIds.map((id) => new mongoose.Types.ObjectId(String(id)));
  const rows: (TripTotals & { _id: unknown })[] = await Expense.aggregate(
    tripTotalsPipeline(visibility, ids)
  );
  return new Map(
    rows.map((row) => [
      String(row._id),
      { expenseCount: row.expenseCount, totalAmount: roundMoney(row.totalAmount ?? 0) },
    ])
  );
}

/** Loads one trip, populated, as the caller sees it. `null` when it doesn't exist. */
export async function loadTripListItem(tripId: string, user: AuthUser): Promise<TripListItem | null> {
  const trip: LeanDoc | null = await populateTripRefs(Trip.findById(tripId)).lean();
  if (!trip) return null;
  const totals = await visibleTripTotals([trip._id], user);
  return serializeTripListItem(trip, totals.get(String(trip._id)) ?? NO_TOTALS, user);
}

/**
 * Totals of the expenses matching `filter` (one trip, as the caller sees it),
 * plus each person's share the way Spend by User credits it.
 */
export function tripDetailSummaryPipeline(filter: Record<string, unknown>): PipelineStage[] {
  return [
    { $match: filter },
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              totalAmount: { $sum: baseTotalExpr },
              expenseCount: { $sum: 1 },
              pocketAmount: { $sum: pocketBaseExpr },
              companyAmount: { $sum: companyBaseExpr },
            },
          },
        ],
        byPayer: [...spendByPayerPipeline, { $sort: { totalSpend: -1, _id: 1 } }],
      },
    },
  ] as PipelineStage[];
}

interface PayerRow {
  _id: unknown;
  totalSpend: number;
  pocketSpend: number;
  companySpend: number;
}

/** Runs `tripDetailSummaryPipeline` and joins the payers' names. */
export async function getTripDetailSummary(
  filter: Record<string, unknown>,
  expenses: { date: string | Date; amount: number; amountInBaseCurrency?: number | null; travelType?: TravelType | null }[]
): Promise<TripDetailSummary> {
  const [result] = await Expense.aggregate(tripDetailSummaryPipeline(filter));
  const totals = result?.totals?.[0];
  const payerRows: PayerRow[] = result?.byPayer ?? [];

  const payerIds = payerRows.map((row) => row._id).filter(Boolean);
  const users: LeanDoc[] =
    payerIds.length > 0
      ? await User.find({ _id: { $in: payerIds } }).select(TRIP_TRAVELER_FIELDS).lean()
      : [];
  const userById = new Map(users.map((user) => [String(user._id), user]));

  const byPayer: TripPayerTotal[] = payerRows.map((row) => ({
    user: tripPerson(userById.get(String(row._id)) ?? { _id: row._id }),
    totalSpend: roundMoney(row.totalSpend ?? 0),
    pocketSpend: roundMoney(row.pocketSpend ?? 0),
    companySpend: roundMoney(row.companySpend ?? 0),
  }));

  return {
    totalAmount: roundMoney(totals?.totalAmount ?? 0),
    expenseCount: totals?.expenseCount ?? 0,
    pocketAmount: roundMoney(totals?.pocketAmount ?? 0),
    companyAmount: roundMoney(totals?.companyAmount ?? 0),
    byType: totalsByTravelType(
      expenses.map((expense) => ({
        date: isoDate(expense.date),
        amount: expense.amount,
        amountInBaseCurrency: expense.amountInBaseCurrency,
        travelType: expense.travelType ?? null,
      }))
    ),
    byPayer,
  };
}

// ---------------------------------------------------------------------------
// Grouped expense list (`GET /api/expenses?groupTrips=true`)

interface GroupedItem {
  _id: unknown;
  ids: unknown[];
}

/**
 * One page of the expense list where each trip is one item. Returns the
 * page's expenses flat, in item order (a trip's own expenses oldest first),
 * the trips that appear on the page, and the total number of items.
 */
export async function getGroupedExpensePage(
  filter: Record<string, unknown>,
  page: number,
  limit: number
) {
  const [result] = await Expense.aggregate(
    groupedExpensePagePipeline(filter, page, limit) as PipelineStage[]
  );
  const items: GroupedItem[] = result?.items ?? [];
  const total: number = result?.total?.[0]?.count ?? 0;

  const allIds = items.flatMap((item) => item.ids);
  const isTripItem = (item: GroupedItem) =>
    !(item.ids.length === 1 && String(item.ids[0]) === String(item._id));
  const tripIds = items.filter(isTripItem).map((item) => item._id);

  const [expenses, trips]: [LeanDoc[], LeanDoc[]] = await Promise.all([
    allIds.length > 0
      ? populateExpenseRefs(Expense.find({ _id: { $in: allIds } })).lean()
      : Promise.resolve([]),
    tripIds.length > 0
      ? Trip.find({ _id: { $in: tripIds } })
          .select("name destinations startDate endDate travelers")
          .populate("travelers", TRIP_TRAVELER_FIELDS)
          .lean()
      : Promise.resolve([]),
  ]);

  const expenseById = new Map(expenses.map((expense) => [String(expense._id), expense]));
  const ordered: LeanDoc[] = [];
  for (const item of items) {
    const found = item.ids
      .map((id) => expenseById.get(String(id)))
      .filter((expense): expense is LeanDoc => Boolean(expense));
    if (isTripItem(item)) found.sort(compareTripExpenses);
    ordered.push(...found);
  }

  const now = new Date();
  const tripMap: Record<string, TripSummary> = {};
  for (const trip of trips) tripMap[String(trip._id)] = serializeTripSummary(trip, now);

  return { expenses: await withLinkedAssetCounts(ordered), trips: tripMap, total };
}

// ---------------------------------------------------------------------------
// Moving expenses into and out of a trip

/** At most this many ids per `add` / `remove` list of one request. */
export const TRIP_MOVE_LIMIT = 200;

/** Validates one id list of `PATCH /api/trips/[id]/expenses`. Throws a user-facing message. */
export function parseExpenseIdList(raw: unknown, field: string): mongoose.Types.ObjectId[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new Error(`"${field}" must be a list of expense ids`);
  if (raw.length > TRIP_MOVE_LIMIT) {
    throw new Error(`You can move at most ${TRIP_MOVE_LIMIT} expenses at a time`);
  }
  const seen = new Set<string>();
  const ids: mongoose.Types.ObjectId[] = [];
  for (const value of raw) {
    const id = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (!/^[a-f0-9]{24}$/.test(id)) throw new Error("Expense id is invalid");
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(new mongoose.Types.ObjectId(id));
  }
  return ids;
}

/** How far around the trip dates candidate expenses are looked for. */
export const CANDIDATE_DAYS_BEFORE = 60;
export const CANDIDATE_DAYS_AFTER = 14;
export const CANDIDATE_LIMIT = 100;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Expenses that could be added to `trip`: in no trip yet, visible to the
 * caller, submitted by one of its travelers (or the caller, who may be
 * booking for them; `user` role: only themselves), dated from 60 days before
 * the trip to 14 days after it, optionally matching `search`.
 */
export function tripCandidateFilter(
  trip: { startDate: Date | string; endDate: Date | string; travelers?: unknown[] },
  user: AuthUser,
  search: string | null
): Record<string, unknown> {
  const params = new URLSearchParams({ trip: "none" });
  if (search?.trim()) params.set("search", search.trim());
  const filter = buildExpenseFilter(params, user);

  if (!filter.createdBy) {
    const submitters = new Set(
      [...(trip.travelers ?? []), user._id].map((traveler) =>
        String(
          traveler && typeof traveler === "object" && "_id" in traveler
            ? (traveler as { _id: unknown })._id
            : traveler
        )
      )
    );
    filter.createdBy = {
      $in: [...submitters]
        .filter((id) => mongoose.isValidObjectId(id))
        .map((id) => new mongoose.Types.ObjectId(id)),
    };
  }

  const start = new Date(`${isoDate(trip.startDate).slice(0, 10)}T00:00:00.000Z`);
  const end = new Date(`${isoDate(trip.endDate).slice(0, 10)}T23:59:59.999Z`);
  filter.date = {
    $gte: new Date(start.getTime() - CANDIDATE_DAYS_BEFORE * DAY_MS),
    $lte: new Date(end.getTime() + CANDIDATE_DAYS_AFTER * DAY_MS),
  };
  return filter;
}
