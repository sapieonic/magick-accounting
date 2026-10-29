import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { verifyAuth } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { canViewTrip, isAdminUser } from "@/lib/trip-server";
import { parseExpenseIdList } from "@/lib/trip-query";
import Trip from "@/models/Trip";
import Expense from "@/models/Expense";

/**
 * Moves expenses into or out of a trip: `{ add?: string[], remove?: string[] }`.
 * Anyone who can see the trip may do this; `user`-role people only for their
 * own expenses. Adding takes an expense out of any other trip it was in.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  await connectDB();
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ error: "Trip id is invalid" }, { status: 400 });
  }

  let add: mongoose.Types.ObjectId[];
  let remove: mongoose.Types.ObjectId[];
  try {
    const body = await req.json();
    add = parseExpenseIdList(body?.add, "add");
    remove = parseExpenseIdList(body?.remove, "remove");
    if (add.length === 0 && remove.length === 0) {
      throw new Error("Choose at least one expense to add or remove");
    }
    const removing = new Set(remove.map(String));
    if (add.some((expenseId) => removing.has(String(expenseId)))) {
      throw new Error("An expense cannot be both added to and removed from the trip");
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trip: any = await Trip.findById(id).select("travelers createdBy").lean();
  if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });
  if (!canViewTrip(trip, authResult)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // `user`-role people may only move their own expenses.
  const ownerScope: Record<string, unknown> = isAdminUser(authResult)
    ? {}
    : { createdBy: new mongoose.Types.ObjectId(authResult._id) };
  if (!isAdminUser(authResult)) {
    const othersExpense = await Expense.exists({
      _id: { $in: [...add, ...remove] },
      createdBy: { $ne: ownerScope.createdBy },
    });
    if (othersExpense) {
      return NextResponse.json({ error: "You can only move your own expenses" }, { status: 403 });
    }
  }

  const tripId = new mongoose.Types.ObjectId(id);
  const [removed, added] = await Promise.all([
    remove.length > 0
      ? Expense.updateMany(
          { _id: { $in: remove }, trip: tripId, ...ownerScope },
          { $set: { trip: null, travelType: null } }
        )
      : Promise.resolve({ matchedCount: 0 }),
    add.length > 0
      ? Expense.updateMany({ _id: { $in: add }, ...ownerScope }, { $set: { trip: tripId } })
      : Promise.resolve({ matchedCount: 0 }),
  ]);

  return NextResponse.json({ added: added.matchedCount ?? 0, removed: removed.matchedCount ?? 0 });
}
