import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { verifyAuth } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { canViewTrip } from "@/lib/trip-server";
import {
  CANDIDATE_LIMIT,
  CANDIDATE_SORT,
  populateExpenseRefs,
  tripCandidateFilter,
  withLinkedAssetCounts,
  type LeanDoc,
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

  const trip: LeanDoc = await Trip.findById(id).select("startDate endDate travelers createdBy").lean();
  if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });
  if (!canViewTrip(trip, authResult)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const filter = tripCandidateFilter(trip, authResult, searchParams.get("search"));
  // One extra row tells whether the list was cut off.
  const found: LeanDoc[] = await populateExpenseRefs(Expense.find(filter))
    .sort(CANDIDATE_SORT)
    .limit(CANDIDATE_LIMIT + 1)
    .lean();
  const truncated = found.length > CANDIDATE_LIMIT;

  return NextResponse.json({
    expenses: await withLinkedAssetCounts(found.slice(0, CANDIDATE_LIMIT)),
    truncated,
  });
}
