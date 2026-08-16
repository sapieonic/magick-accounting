import mongoose, { ClientSession } from "mongoose";
import { AuthUser } from "@/lib/auth";
import {
  getEffectiveAssetAllocation,
  normalizeAssetPurchases,
  roundMoney,
} from "@/lib/asset";
import Asset from "@/models/Asset";
import AssetAssignment from "@/models/AssetAssignment";
import AssetEvent from "@/models/AssetEvent";
import Expense from "@/models/Expense";
import User from "@/models/User";

let assetIndexesReady: Promise<unknown> | null = null;

export function ensureAssetIndexes(): Promise<unknown> {
  if (!assetIndexesReady) {
    assetIndexesReady = Promise.all([
      Expense.init(),
      Asset.init(),
      AssetAssignment.init(),
      AssetEvent.init(),
    ]).catch(
      (error) => {
        assetIndexesReady = null;
        throw error;
      }
    );
  }
  return assetIndexesReady;
}

interface ExpenseForAssets {
  _id: mongoose.Types.ObjectId;
  amount: number;
  gstAmount?: number | null;
  date: Date;
  department: mongoose.Types.ObjectId | string;
  assetAllocationRevision?: number;
}

export interface AssetCreationReservation {
  batchId: string;
  amount: number;
  gstAmount: number;
  reserved: boolean;
  transactional: boolean;
}

interface CreateAssetsOptions {
  rawAssets: unknown;
  expense: ExpenseForAssets;
  authUser: AuthUser;
  rateToBase: number;
  session: ClientSession | null;
  reservation: AssetCreationReservation;
}

export async function createAssetsForExpense({
  rawAssets,
  expense,
  authUser,
  rateToBase,
  session,
  reservation,
}: CreateAssetsOptions) {
  const query = Asset.find({ purchaseExpense: expense._id });
  if (session) query.session(session);
  const existingAssets = await query.select("allocatedAmount allocatedGstAmount").lean();
  const persistedAssetAmount = roundMoney(
    existingAssets.reduce((total, asset) => total + asset.allocatedAmount, 0)
  );
  const persistedAssetGstAmount = roundMoney(
    existingAssets.reduce((total, asset) => total + asset.allocatedGstAmount, 0)
  );
  const expenseQuery = Expense.findById(expense._id).select(
    "assetAllocatedAmount assetAllocatedGstAmount assetAllocationRevision"
  );
  if (session) expenseQuery.session(session);
  const currentExpense = (await expenseQuery.lean()) as
    | {
        assetAllocatedAmount?: number;
        assetAllocatedGstAmount?: number;
        assetAllocationRevision?: number;
      }
    | null;
  if (!currentExpense) throw new Error("Linked purchase expense was not found");
  const expectedRevision = Number(expense.assetAllocationRevision || 0);
  const currentRevision = Number(currentExpense.assetAllocationRevision || 0);
  if (currentRevision !== expectedRevision) {
    throw new Error("Expense or asset allocation changed concurrently; reload and try again");
  }
  // A reservation becomes visible before its asset documents in standalone
  // mode. Taking the greater value prevents a concurrent request from using
  // the same remaining amount during that window, while still self-healing
  // legacy rows whose counters have not yet been backfilled.
  const alreadyAllocated = getEffectiveAssetAllocation(
    persistedAssetAmount,
    Number(currentExpense.assetAllocatedAmount || 0)
  );
  const alreadyAllocatedGst = getEffectiveAssetAllocation(
    persistedAssetGstAmount,
    Number(currentExpense.assetAllocatedGstAmount || 0)
  );
  const availableAmount = roundMoney(expense.amount - alreadyAllocated);
  const availableGst = roundMoney((expense.gstAmount || 0) - alreadyAllocatedGst);
  const assets = normalizeAssetPurchases(
    rawAssets,
    availableAmount,
    availableGst,
    new Date(expense.date)
  );

  if (assets.length === 0) return [];

  const reservationAmount = roundMoney(
    assets.reduce((total, asset) => total + asset.allocatedAmount, 0)
  );
  const reservationGstAmount = roundMoney(
    assets.reduce((total, asset) => total + asset.allocatedGstAmount, 0)
  );
  const revision = currentRevision;
  const revisionFilter =
    revision === 0
      ? { $or: [{ assetAllocationRevision: 0 }, { assetAllocationRevision: { $exists: false } }] }
      : { assetAllocationRevision: revision };
  const reserveQuery = Expense.findOneAndUpdate(
    { _id: expense._id, ...revisionFilter },
    {
      $set: {
        assetAllocatedAmount: roundMoney(alreadyAllocated + reservationAmount),
        assetAllocatedGstAmount: roundMoney(alreadyAllocatedGst + reservationGstAmount),
      },
      $inc: { assetAllocationRevision: 1 },
    },
    { new: true }
  );
  if (session) reserveQuery.session(session);
  if (!(await reserveQuery)) {
    throw new Error("Asset allocation changed concurrently; reload and try again");
  }
  reservation.amount = reservationAmount;
  reservation.gstAmount = reservationGstAmount;
  reservation.reserved = true;

  if (authUser.role === "user") {
    assets.forEach((asset) => {
      asset.assignedTo = authUser._id;
    });
  } else {
    const assigneeIds = [
      ...new Set(assets.map((asset) => asset.assignedTo).filter((id): id is string => Boolean(id))),
    ];
    if (assigneeIds.length > 0) {
      const userQuery = User.countDocuments({ _id: { $in: assigneeIds } });
      if (session) userQuery.session(session);
      if ((await userQuery) !== assigneeIds.length) {
        throw new Error("One or more assignees are invalid");
      }
    }
  }

  const purchaseDate = new Date(expense.date);
  const assetDocuments = assets.map((asset) => {
    const _id = new mongoose.Types.ObjectId();
    return {
      _id,
      assetTag: `AST-${purchaseDate.getUTCFullYear()}-${_id.toString().slice(-8).toUpperCase()}`,
      ...asset,
      creationBatchId: reservation.batchId,
      purchaseExpense: expense._id,
      department: expense.department,
      allocatedAmountInBaseCurrency: roundMoney(asset.allocatedAmount * rateToBase),
      capitalizedCostInBaseCurrency: roundMoney(asset.capitalizedCost * rateToBase),
      status: "active",
      createdBy: authUser._id,
    };
  });

  const insertedAssets = (await Asset.insertMany(
    assetDocuments,
    sessionOptionsForInsert(session)
  )) as Array<any>;
  const assignments = insertedAssets
    .filter((asset) => asset.assignedTo)
    .map((asset) => ({
      asset: asset._id,
      assignedTo: asset.assignedTo,
      assignedBy: authUser._id,
      department: asset.department,
      purpose: asset.purpose,
      location: asset.location,
      assignedAt: asset.putToUseDate,
    }));
  if (assignments.length > 0) {
    await AssetAssignment.insertMany(assignments, sessionOptionsForInsert(session));
  }
  await AssetEvent.insertMany(
    insertedAssets.map((asset) => ({
      asset: asset._id,
      assetTag: asset.assetTag,
      purchaseExpense: expense._id,
      type: "created",
      actor: authUser._id,
      changes: {},
      snapshot: asset.toObject(),
      occurredAt: new Date(),
    })),
    sessionOptionsForInsert(session)
  );
  return insertedAssets;
}

export async function compensateAssetCreation(
  expenseId: mongoose.Types.ObjectId | string,
  reservation: AssetCreationReservation
): Promise<void> {
  if (reservation.transactional) return;
  const assets = await Asset.find({
    purchaseExpense: expenseId,
    creationBatchId: reservation.batchId,
  })
    .select("_id")
    .lean();
  const assetIds = assets.map((asset) => asset._id);
  if (assetIds.length > 0) {
    await Promise.allSettled([
      AssetAssignment.deleteMany({ asset: { $in: assetIds } }),
      AssetEvent.deleteMany({ asset: { $in: assetIds } }),
      Asset.deleteMany({ _id: { $in: assetIds }, creationBatchId: reservation.batchId }),
    ]);
  }
  if (reservation.reserved) {
    await Expense.updateOne(
      { _id: expenseId },
      {
        $inc: {
          assetAllocatedAmount: -reservation.amount,
          assetAllocatedGstAmount: -reservation.gstAmount,
          assetAllocationRevision: 1,
        },
      }
    );
  }
}

function sessionOptionsForInsert(session: ClientSession | null): { session?: ClientSession } {
  return session ? { session } : {};
}
