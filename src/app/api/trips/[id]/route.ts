import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { verifyAuth } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { normalizeTripInput } from "@/lib/trip";
import {
  assertTripRefsExist,
  canManageTrip,
  canViewTrip,
  storedTripInput,
  tripDocumentFields,
} from "@/lib/trip-server";
import {
  getTripDetailSummary,
  loadTripListItem,
  populateExpenseRefs,
  populateTripRefs,
  serializeTripListItem,
  TRIP_EXPENSE_SORT,
  tripExpenseFilter,
  withLinkedAssetCounts,
  type LeanDoc,
} from "@/lib/trip-query";
import Trip from "@/models/Trip";
import Expense from "@/models/Expense";
import type { TripDetailResponse } from "@/types/trip";

/** Fields a trip update may change; anything else in the body is ignored. */
const EDITABLE_FIELDS = [
  "name",
  "purpose",
  "destinations",
  "startDate",
  "endDate",
  "travelers",
  "department",
  "budget",
  "notes",
] as const;

type RouteContext = { params: Promise<{ id: string }> };

function invalidId() {
  return NextResponse.json({ error: "Trip id is invalid" }, { status: 400 });
}

function notFound() {
  return NextResponse.json({ error: "Trip not found" }, { status: 404 });
}

function cannotManage() {
  return NextResponse.json(
    { error: "Only the trip's creator or an admin can change this trip" },
    { status: 403 }
  );
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  await connectDB();
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return invalidId();

  const trip: LeanDoc = await populateTripRefs(Trip.findById(id)).lean();
  if (!trip) return notFound();
  if (!canViewTrip(trip, authResult)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const filter = tripExpenseFilter(id, authResult);
  const expenses: LeanDoc[] = await populateExpenseRefs(Expense.find(filter))
    .sort(TRIP_EXPENSE_SORT)
    .lean();
  const [summary, expensesWithAssets] = await Promise.all([
    getTripDetailSummary(filter, expenses),
    withLinkedAssetCounts(expenses),
  ]);

  const response: TripDetailResponse = {
    trip: serializeTripListItem(
      trip,
      { expenseCount: summary.expenseCount, totalAmount: summary.totalAmount },
      authResult
    ),
    summary,
    expenses: expensesWithAssets,
  };
  return NextResponse.json(response);
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  await connectDB();
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return invalidId();

  const existing: LeanDoc = await Trip.findById(id).lean();
  if (!existing) return notFound();
  if (!canManageTrip(existing, authResult)) return cannotManage();

  try {
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Trip details are required");
    }
    // Partial update: merge onto the stored trip, then validate the whole.
    const merged = storedTripInput(existing);
    for (const field of EDITABLE_FIELDS) {
      if (body[field] !== undefined) merged[field] = body[field];
    }
    const input = normalizeTripInput(merged);
    await assertTripRefsExist(input);

    const updated = await Trip.findByIdAndUpdate(
      id,
      { $set: tripDocumentFields(input) },
      { new: true, runValidators: true }
    );
    if (!updated) return notFound();

    const item = await loadTripListItem(id, authResult);
    if (!item) return notFound();
    return NextResponse.json({ trip: item });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update trip";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  await connectDB();
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return invalidId();

  const trip: LeanDoc = await Trip.findById(id).select("travelers createdBy").lean();
  if (!trip) return notFound();
  if (!canManageTrip(trip, authResult)) return cannotManage();

  // Expenses are never deleted with their trip: every one of them (not just
  // the caller's) goes back to being an ordinary expense.
  const tripId = new mongoose.Types.ObjectId(id);
  // Delete first: once the trip is gone no request can link an expense to it,
  // so the unlink below can't miss one added in between.
  await Trip.deleteOne({ _id: tripId });
  await Expense.updateMany({ trip: tripId }, { $set: { trip: null, travelType: null } });

  return NextResponse.json({ message: "Trip deleted" });
}
