import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, verifyAuth } from "@/lib/auth";
import {
  calculateAssetBookValue,
  assertAssetStatusTransition,
  getDepreciationAsOfDate,
  normalizeDepreciationPolicy,
} from "@/lib/asset";
import { connectDB } from "@/lib/mongodb";
import { runInTransaction, sessionOptions } from "@/lib/mongodb-transaction";
import { ensureAssetIndexes } from "@/lib/asset-server";
import Asset, { ASSET_STATUSES } from "@/models/Asset";
import AssetAssignment from "@/models/AssetAssignment";
import AssetEvent from "@/models/AssetEvent";
import Expense from "@/models/Expense";
import User from "@/models/User";
import Department from "@/models/Department";
import mongoose from "mongoose";
import "@/models/Department";
import "@/models/Currency";

const POPULATE_ASSET = [
  { path: "assignedTo", select: "name email photoURL" },
  { path: "department", select: "name" },
  { path: "createdBy", select: "name email" },
  {
    path: "purchaseExpense",
    select: "title amount gstAmount date receiptKey receiptFilename currency createdBy",
    populate: { path: "currency", select: "code name symbol isBase" },
  },
];

function canViewAsset(
  role: "master_admin" | "admin" | "user",
  userId: string,
  assignedTo?: { _id?: unknown } | string | null
): boolean {
  if (role !== "user") return true;
  const id = typeof assignedTo === "string" ? assignedTo : assignedTo?._id;
  return String(id || "") === userId;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;
  await connectDB();

  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ error: "Asset id is invalid" }, { status: 400 });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const asset: any = await Asset.findById(id).populate(POPULATE_ASSET).lean();
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  if (!canViewAsset(authResult.role, authResult._id, asset.assignedTo)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const assignmentFilter =
    authResult.role === "user" ? { asset: id, assignedTo: authResult._id } : { asset: id };
  const assignments = await AssetAssignment.find(assignmentFilter)
    .populate("assignedTo", "name email photoURL")
    .populate("assignedBy", authResult.role === "user" ? "name" : "name email")
    .populate("department", "name")
    .sort({ assignedAt: -1, _id: -1 })
    .lean();
  const events =
    authResult.role === "user"
      ? []
      : await AssetEvent.find({ asset: id })
          .select("-snapshot")
          .populate("actor", "name email")
          .sort({ occurredAt: -1, _id: -1 })
          .lean();
  const canViewFinancials =
    authResult.role !== "user" ||
    String(asset.purchaseExpense?.createdBy?._id || asset.purchaseExpense?.createdBy || "") ===
      authResult._id;
  const now = new Date();
  const valuation = calculateAssetBookValue(
    asset.capitalizedCost,
    asset.residualValue,
    asset.depreciationMethod,
    asset.depreciationRate,
    asset.putToUseDate,
    getDepreciationAsOfDate(asset.status, asset.lifecycleDate, asset.updatedAt, now)
  );
  const visibleAsset = { ...asset, ...valuation, canViewFinancials };
  if (visibleAsset.purchaseExpense) delete visibleAsset.purchaseExpense.createdBy;
  if (!canViewFinancials) {
    delete visibleAsset.purchaseExpense.amount;
    delete visibleAsset.purchaseExpense.gstAmount;
    delete visibleAsset.purchaseExpense.receiptKey;
    delete visibleAsset.purchaseExpense.receiptFilename;
    [
      "allocatedAmount",
      "allocatedGstAmount",
      "recoverableGstAmount",
      "capitalizedCost",
      "allocatedAmountInBaseCurrency",
      "capitalizedCostInBaseCurrency",
      "residualValue",
      "depreciationMethod",
      "depreciationRate",
      "accumulatedDepreciation",
      "bookValue",
    ].forEach((field) => delete visibleAsset[field]);
  }
  return NextResponse.json({ asset: visibleAsset, assignments, events });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;
  const adminCheck = requireAdmin(authResult);
  if (adminCheck) return adminCheck;
  await connectDB();

  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ error: "Asset id is invalid" }, { status: 400 });
  }
  const asset = await Asset.findById(id);
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

  try {
    const body = await req.json();
    const name = body.name !== undefined ? String(body.name).trim() : asset.name;
    const assetCategory =
      body.assetCategory !== undefined ? String(body.assetCategory).trim() : asset.assetCategory;
    if (!name) throw new Error("Asset name is required");
    if (!assetCategory) throw new Error("Asset category is required");

    const depreciation = normalizeDepreciationPolicy(
      body.depreciationMethod ?? asset.depreciationMethod,
      body.depreciationRate ?? asset.depreciationRate,
      body.residualValue ?? asset.residualValue,
      asset.capitalizedCost
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const purchaseExpense: any = await Expense.findById(asset.purchaseExpense).select("date").lean();
    if (!purchaseExpense) throw new Error("Linked purchase expense was not found");
    const putToUseDate =
      body.putToUseDate !== undefined ? new Date(body.putToUseDate) : asset.putToUseDate;
    if (Number.isNaN(putToUseDate.getTime())) throw new Error("Put-to-use date is invalid");
    if (putToUseDate < purchaseExpense.date) {
      throw new Error("Put-to-use date cannot be before the purchase date");
    }
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    if (putToUseDate > endOfToday) throw new Error("Put-to-use date cannot be in the future");

    const status = body.status !== undefined ? String(body.status) : asset.status;
    if (!ASSET_STATUSES.includes(status as (typeof ASSET_STATUSES)[number])) {
      throw new Error("Asset status is invalid");
    }
    assertAssetStatusTransition(asset.status, status);
    const terminalStatuses = new Set(["retired", "sold", "lost", "disposed"]);
    const isTerminal = terminalStatuses.has(status);
    let lifecycleDate: Date | null = null;
    if (isTerminal) {
      const effectiveLifecycleDate = body.lifecycleDate
        ? new Date(body.lifecycleDate)
        : asset.lifecycleDate || new Date();
      if (Number.isNaN(effectiveLifecycleDate.getTime())) throw new Error("Lifecycle date is invalid");
      if (effectiveLifecycleDate < putToUseDate) {
        throw new Error("Lifecycle date cannot be before the put-to-use date");
      }
      if (effectiveLifecycleDate > endOfToday) throw new Error("Lifecycle date cannot be in the future");
      lifecycleDate = effectiveLifecycleDate;
    }

    const disposalProceeds =
      body.disposalProceeds === "" || body.disposalProceeds == null
        ? null
        : Number(body.disposalProceeds);
    if (disposalProceeds != null && (!Number.isFinite(disposalProceeds) || disposalProceeds < 0)) {
      throw new Error("Disposal proceeds must be a non-negative number");
    }

    const oldAssignee = asset.assignedTo?.toString() || null;
    let newAssignee = oldAssignee;
    if (body.assignedTo !== undefined) {
      newAssignee = body.assignedTo ? String(body.assignedTo) : null;
    }
    if (isTerminal) newAssignee = null;
    if (newAssignee && (!mongoose.isValidObjectId(newAssignee) || !(await User.exists({ _id: newAssignee })))) {
      throw new Error("Assignee is invalid");
    }

    const department = body.department !== undefined ? String(body.department) : asset.department;
    if (
      !mongoose.isValidObjectId(department) ||
      !(await Department.exists({ _id: department }))
    ) {
      throw new Error("Department is invalid");
    }
    const update = {
      name,
      assetCategory,
      serialNumber:
        body.serialNumber !== undefined ? String(body.serialNumber).trim() : asset.serialNumber,
      make: body.make !== undefined ? String(body.make).trim() : asset.make,
      assetModel: body.assetModel !== undefined ? String(body.assetModel).trim() : asset.assetModel,
      purpose: body.purpose !== undefined ? String(body.purpose).trim() : asset.purpose,
      location: body.location !== undefined ? String(body.location).trim() : asset.location,
      department,
      assignedTo: newAssignee,
      depreciationMethod: depreciation.method,
      depreciationRate: depreciation.rate,
      residualValue: depreciation.residualValue,
      putToUseDate,
      status,
      lifecycleDate,
      disposalProceeds: status === "sold" ? disposalProceeds : null,
      lifecycleNotes:
        body.lifecycleNotes !== undefined
          ? String(body.lifecycleNotes).trim()
          : asset.lifecycleNotes,
    };

    const original = asset.toObject() as Record<string, unknown>;
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    Object.entries(update).forEach(([field, to]) => {
      const from = original[field];
      if (String(from ?? "") !== String(to ?? "")) changes[field] = { from, to };
    });
    const assignmentChanged = newAssignee !== oldAssignee;
    const wasTerminal = terminalStatuses.has(asset.status);
    const shouldCloseAssignments = assignmentChanged || (isTerminal && !wasTerminal);
    const recordedAt = new Date();
    const assignmentEffectiveDate = isTerminal && lifecycleDate ? lifecycleDate : recordedAt;
    if (shouldCloseAssignments && isTerminal) {
      const activeAssignment = (await AssetAssignment.findOne({
        asset: asset._id,
        returnedAt: null,
      })
        .select("assignedAt")
        .lean()) as { assignedAt: Date } | null;
      if (activeAssignment && assignmentEffectiveDate < activeAssignment.assignedAt) {
        throw new Error("Lifecycle date cannot be before the current assignment began");
      }
    }

    await ensureAssetIndexes();
    await runInTransaction(async (session) => {
      if (shouldCloseAssignments) {
        await AssetAssignment.updateMany(
          { asset: asset._id, returnedAt: null },
          { $set: { returnedAt: assignmentEffectiveDate, returnedRecordedAt: recordedAt } },
          sessionOptions(session)
        );
        if (assignmentChanged && newAssignee) {
          await AssetAssignment.create(
            [
              {
                asset: asset._id,
                assignedTo: newAssignee,
                assignedBy: authResult._id,
                department,
                purpose: update.purpose,
                location: update.location,
                assignedAt: assignmentEffectiveDate,
              },
            ],
            sessionOptions(session)
          );
        }
      }

      const updateQuery = Asset.findOneAndUpdate(
        { _id: asset._id, updatedAt: asset.updatedAt },
        update,
        { new: true, runValidators: true, ...sessionOptions(session) }
      );
      const updatedAsset = await updateQuery;
      if (!updatedAsset) throw new Error("Asset changed while you were editing it; reload and try again");

      if (Object.keys(changes).length > 0) {
        await AssetEvent.create(
          [
            {
              asset: asset._id,
              assetTag: asset.assetTag,
              purchaseExpense: asset.purchaseExpense,
              type: assignmentChanged ? (newAssignee ? "assigned" : "unassigned") : "updated",
              actor: authResult._id,
              reason: body.changeReason || "",
              changes,
              occurredAt: new Date(),
            },
          ],
          sessionOptions(session)
        );
      }
      return true;
    }, { allowStandaloneFallback: false });

    const updated = await Asset.findById(id)
      .populate(POPULATE_ASSET)
      .lean();

    return NextResponse.json({ asset: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update asset";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;
  const adminCheck = requireAdmin(authResult);
  if (adminCheck) return adminCheck;
  await connectDB();

  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ error: "Asset id is invalid" }, { status: 400 });
  }
  const requestBody = await req.json().catch(() => ({}));
  const reason = String(requestBody.reason || "").trim();
  if (reason.length < 5 || reason.length > 500) {
    return NextResponse.json(
      { error: "A correction reason between 5 and 500 characters is required" },
      { status: 400 }
    );
  }

  const asset = await Asset.findById(id);
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

  try {
    await ensureAssetIndexes();
    await runInTransaction(async (session) => {
      const snapshotAsset = await Asset.findOne({ _id: asset._id, updatedAt: asset.updatedAt })
        .populate("assignedTo", "name email")
        .populate("department", "name")
        .populate("createdBy", "name email")
        .session(session!)
        .lean();
      if (!snapshotAsset) {
        throw new Error("Asset changed while you were reversing it; reload and try again");
      }
      const purchaseSnapshot = await Expense.findById(asset.purchaseExpense)
        .populate("category", "name")
        .populate("department", "name")
        .populate("currency", "code name symbol")
        .populate("createdBy", "name email")
        .session(session!)
        .lean();
      const assignmentSnapshot = await AssetAssignment.find({ asset: asset._id })
        .populate("assignedTo", "name email")
        .populate("assignedBy", "name email")
        .populate("department", "name")
        .sort({ assignedAt: 1, _id: 1 })
        .session(session!)
        .lean();
      const deleted = await Asset.deleteOne(
        { _id: asset._id, updatedAt: asset.updatedAt },
        sessionOptions(session)
      );
      if (deleted.deletedCount !== 1) {
        throw new Error("Asset changed while you were reversing it; reload and try again");
      }
      const remainingAllocation = await Asset.aggregate([
        { $match: { purchaseExpense: asset.purchaseExpense } },
        {
          $group: {
            _id: null,
            amount: { $sum: "$allocatedAmount" },
            gstAmount: { $sum: "$allocatedGstAmount" },
          },
        },
      ]).session(session!);
      const expenseUpdate = await Expense.updateOne(
        { _id: asset.purchaseExpense },
        {
          $set: {
            assetAllocatedAmount: remainingAllocation[0]?.amount || 0,
            assetAllocatedGstAmount: remainingAllocation[0]?.gstAmount || 0,
          },
          $inc: { assetAllocationRevision: 1 },
        },
        sessionOptions(session)
      );
      if (expenseUpdate.matchedCount !== 1) {
        throw new Error("Linked purchase expense was not found");
      }
      await AssetAssignment.deleteMany({ asset: asset._id }, sessionOptions(session));
      await AssetEvent.create(
      [
        {
          asset: asset._id,
          assetTag: asset.assetTag,
          purchaseExpense: asset.purchaseExpense,
          type: "reversed",
          actor: authResult._id,
          reason,
          changes: {},
          snapshot: {
            asset: snapshotAsset,
            purchaseExpense: purchaseSnapshot,
            assignments: assignmentSnapshot,
          },
          occurredAt: new Date(),
        },
      ],
      sessionOptions(session)
      );
      return true;
    }, { allowStandaloneFallback: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to reverse asset";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ message: "Asset correction recorded and asset reversed" });
}
