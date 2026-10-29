import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { normalizeTripInput } from "@/lib/trip";
import { assertTripRefsExist, tripAccessFilter, tripDocumentFields } from "@/lib/trip-server";
import {
  loadTripListItem,
  populateTripRefs,
  serializeTripListItem,
  tripSearchFilter,
  visibleTripTotals,
} from "@/lib/trip-query";
import Trip from "@/models/Trip";

export async function GET(req: NextRequest) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  await connectDB();
  const { searchParams } = new URL(req.url);
  const filter = tripSearchFilter(tripAccessFilter(authResult), searchParams.get("q"));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trips: any[] = await populateTripRefs(Trip.find(filter))
    .sort({ startDate: -1, createdAt: -1 })
    .lean();
  const totals = await visibleTripTotals(
    trips.map((trip) => trip._id),
    authResult
  );
  const now = new Date();

  return NextResponse.json({
    trips: trips.map((trip) =>
      serializeTripListItem(trip, totals.get(String(trip._id)), authResult, now)
    ),
  });
}

export async function POST(req: NextRequest) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  try {
    await connectDB();
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Trip details are required");
    }
    // Whoever creates a trip travels on it unless they list the travelers.
    const travelers =
      body.travelers === undefined ||
      body.travelers === null ||
      (Array.isArray(body.travelers) && body.travelers.length === 0)
        ? [authResult._id]
        : body.travelers;
    const input = normalizeTripInput({ ...body, travelers });
    await assertTripRefsExist(input);

    const trip = await Trip.create({ ...tripDocumentFields(input), createdBy: authResult._id });
    const item = await loadTripListItem(String(trip._id), authResult);
    return NextResponse.json({ trip: item }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create trip";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
