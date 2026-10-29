import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { verifyAuth } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { canViewTrip } from "@/lib/trip-server";
import {
  CANDIDATE_LIMIT,
  populateExpenseRefs,
  TRIP_EXPENSE_SORT,
  tripCandidateFilter,
  withLinkedAssetCounts,
} from "@/lib/trip-query";
import Trip from "@/models/Trip";
import Expense from "@/models/Expense";

/** Expenses not in any trip that could be added to this one (see `tripCandidateFilter`). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  await connectDB();
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ error: "Trip id is invalid" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trip: any = await Trip.findById(id).select("startDate endDate travelers createdBy").lean();
  if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });
  if (!canViewTrip(trip, authResult)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const filter = tripCandidateFilter(trip, authResult, searchParams.get("search"));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const expenses: any[] = await populateExpenseRefs(Expense.find(filter))
    .sort(TRIP_EXPENSE_SORT)
    .limit(CANDIDATE_LIMIT)
    .lean();

  return NextResponse.json({ expenses: await withLinkedAssetCounts(expenses) });
}
