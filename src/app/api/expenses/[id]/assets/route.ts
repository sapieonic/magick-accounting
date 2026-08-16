import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { verifyAuth } from "@/lib/auth";
import {
  AssetCreationReservation,
  compensateAssetCreation,
  createAssetsForExpense,
  ensureAssetIndexes,
} from "@/lib/asset-server";
import { connectDB } from "@/lib/mongodb";
import { runInTransaction } from "@/lib/mongodb-transaction";
import Asset from "@/models/Asset";
import Expense from "@/models/Expense";
import "@/models/Department";
import "@/models/User";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;
  await connectDB();

  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ error: "Expense id is invalid" }, { status: 400 });
  }
  const expense = await Expense.findById(id);
  if (!expense) return NextResponse.json({ error: "Expense not found" }, { status: 404 });
  if (authResult.role === "user" && expense.createdBy.toString() !== authResult._id) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const existingAssets = await Asset.find({ purchaseExpense: expense._id }).select("_id").lean();
  if (authResult.role === "user" && existingAssets.length > 0) {
    return NextResponse.json(
      { error: "An administrator must add assets to a company-managed purchase" },
      { status: 403 }
    );
  }
  const reservation: AssetCreationReservation = {
    batchId: new mongoose.Types.ObjectId().toString(),
    amount: 0,
    gstAmount: 0,
    reserved: false,
    transactional: true,
  };
  let creationCompleted = false;
  try {
    const body = await req.json();
    const rateToBase =
      expense.exchangeRateToBase ||
      (expense.amount > 0 && expense.amountInBaseCurrency != null
        ? expense.amountInBaseCurrency / expense.amount
        : 1);

    await ensureAssetIndexes();
    await runInTransaction(async (session, transactional) => {
      reservation.transactional = transactional;
      await createAssetsForExpense({
        rawAssets: body.assets,
        expense,
        authUser: authResult,
        rateToBase,
        session,
        reservation,
      });
      return true;
    });
    creationCompleted = true;

    const assets = await Asset.find({ purchaseExpense: expense._id })
      .populate("assignedTo", "name email photoURL")
      .populate("department", "name")
      .sort({ assetTag: 1 })
      .lean();
    return NextResponse.json({ assets }, { status: 201 });
  } catch (err) {
    if (creationCompleted) {
      return NextResponse.json(
        {
          assets: [],
          warning: "Assets were created, but their populated response could not be loaded",
        },
        { status: 201 }
      );
    }
    try {
      await compensateAssetCreation(expense._id, reservation);
    } catch {
      // Preserve the original validation/write error if cleanup cannot run.
    }
    const message = err instanceof Error ? err.message : "Failed to create linked assets";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
