import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Expense from "@/models/Expense";
import Currency from "@/models/Currency";
import Asset from "@/models/Asset";
import { normalizeGstAmount } from "@/lib/expense";
import { assertLinkedExpenseCurrencyUnchanged, roundMoney } from "@/lib/asset";
import { assertReceiptOwnedByUser } from "@/lib/receipt";
import mongoose from "mongoose";
import "@/models/Category";
import "@/models/Department";
import "@/models/User";
import { deleteObject } from "@/lib/s3";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  await connectDB();
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ error: "Expense id is invalid" }, { status: 400 });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const expense: any = await Expense.findById(id)
    .populate("category", "name")
    .populate("department", "name")
    .populate("currency", "code name symbol rateToBase isBase")
    .populate("createdBy", "name email photoURL")
    .lean();

  if (!expense) {
    return NextResponse.json({ error: "Expense not found" }, { status: 404 });
  }

  if (authResult.role === "user" && expense.createdBy._id.toString() !== authResult._id) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const assets = await Asset.find({ purchaseExpense: id })
    .populate("assignedTo", "name email photoURL")
    .populate("department", "name")
    .sort({ assetTag: 1 })
    .lean();

  return NextResponse.json({ expense, assets });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  await connectDB();
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ error: "Expense id is invalid" }, { status: 400 });
  }
  const expense = await Expense.findById(id);

  if (!expense) {
    return NextResponse.json({ error: "Expense not found" }, { status: 404 });
  }

  if (authResult.role === "user" && expense.createdBy.toString() !== authResult._id) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const requestedReceiptKey =
      body.receiptKey !== undefined ? body.receiptKey || null : expense.receiptKey || null;
    if (requestedReceiptKey !== (expense.receiptKey || null)) {
      assertReceiptOwnedByUser(requestedReceiptKey, authResult._id);
      if (
        requestedReceiptKey &&
        (await Expense.exists({ _id: { $ne: expense._id }, receiptKey: requestedReceiptKey }))
      ) {
        throw new Error("Receipt is already attached to another expense");
      }
    }
    const linkedAssets = await Asset.find({ purchaseExpense: id });
    const hasLinkedAssets =
      linkedAssets.length > 0 || Number(expense.assetAllocatedAmount || 0) > 0;
    const currentCurrencyId = expense.currency?.toString() || "";
    const newCurrencyId = body.currency ? String(body.currency) : currentCurrencyId;
    assertLinkedExpenseCurrencyUnchanged(hasLinkedAssets, currentCurrencyId, newCurrencyId);

    const newAmount = body.amount !== undefined ? Number(body.amount) : expense.amount;
    if (!Number.isFinite(newAmount) || newAmount < 0) {
      throw new Error("Expense amount must be a non-negative number");
    }

    // GST is a component of the total, so it must stay within the effective amount.
    let newGstAmount: number | null;
    if (body.gstAmount !== undefined) {
      // Client explicitly set GST: validate and reject if it exceeds the total.
      newGstAmount = normalizeGstAmount(body.gstAmount, newAmount);
    } else if (expense.gstAmount != null) {
      // Amount/currency changed without touching GST. Clamp the stored GST down
      // to the (possibly lower) total rather than rejecting an unrelated edit.
      newGstAmount = Math.min(expense.gstAmount, newAmount);
    } else {
      newGstAmount = null;
    }

    const allocatedAmount = Math.max(
      Number(expense.assetAllocatedAmount || 0),
      linkedAssets.reduce((total, asset) => total + asset.allocatedAmount, 0)
    );
    const allocatedGstAmount = Math.max(
      Number(expense.assetAllocatedGstAmount || 0),
      linkedAssets.reduce((total, asset) => total + asset.allocatedGstAmount, 0)
    );
    if (allocatedAmount > newAmount) {
      throw new Error(
        `Expense amount cannot be lower than the linked asset allocation (${allocatedAmount})`
      );
    }
    if (allocatedGstAmount > (newGstAmount || 0)) {
      throw new Error(
        `Expense GST cannot be lower than the linked asset GST allocation (${allocatedGstAmount})`
      );
    }

    const newDate = body.date !== undefined ? new Date(body.date) : expense.date;
    if (Number.isNaN(newDate.getTime())) throw new Error("Expense date is invalid");
    if (linkedAssets.some((asset) => asset.putToUseDate < newDate)) {
      throw new Error("Purchase date cannot be later than a linked asset's put-to-use date");
    }

    const changedProtectedField =
      newAmount !== expense.amount ||
      newGstAmount !== (expense.gstAmount ?? null) ||
      newCurrencyId !== currentCurrencyId ||
      newDate.getTime() !== expense.date.getTime() ||
      (body.category !== undefined && String(body.category) !== expense.category.toString()) ||
      (body.department !== undefined && String(body.department) !== expense.department.toString()) ||
      (body.paymentSource !== undefined && body.paymentSource !== expense.paymentSource) ||
      (body.receiptKey !== undefined && body.receiptKey !== (expense.receiptKey || null));
    if (hasLinkedAssets && authResult.role === "user" && changedProtectedField) {
      return NextResponse.json(
        { error: "An administrator must approve accounting changes to a linked asset purchase" },
        { status: 403 }
      );
    }

    let effectiveRateToBase = expense.exchangeRateToBase;
    if (!effectiveRateToBase && expense.amount > 0 && expense.amountInBaseCurrency != null) {
      effectiveRateToBase = expense.amountInBaseCurrency / expense.amount;
    }
    if (!effectiveRateToBase || newCurrencyId !== currentCurrencyId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const curr: any = await Currency.findById(newCurrencyId).lean();
      if (!curr) throw new Error("Currency is invalid");
      effectiveRateToBase = curr.rateToBase;
    }

    const update = {
      title: body.title !== undefined ? body.title : expense.title,
      amount: newAmount,
      gstAmount: newGstAmount,
      currency: newCurrencyId,
      amountInBaseCurrency: roundMoney(newAmount * effectiveRateToBase),
      gstAmountInBaseCurrency:
        newGstAmount != null ? roundMoney(newGstAmount * effectiveRateToBase) : null,
      exchangeRateToBase: effectiveRateToBase,
      category: body.category !== undefined ? body.category : expense.category,
      department: body.department !== undefined ? body.department : expense.department,
      date: newDate,
      description: body.description !== undefined ? body.description : expense.description,
      paymentSource:
        body.paymentSource !== undefined ? body.paymentSource : expense.paymentSource,
      receiptKey: requestedReceiptKey,
      receiptFilename:
        body.receiptFilename !== undefined ? body.receiptFilename : expense.receiptFilename,
    };
    const previousReceiptKey = expense.receiptKey;
    const revision = Number(expense.assetAllocationRevision || 0);
    const revisionFilter =
      revision === 0
        ? { $or: [{ assetAllocationRevision: 0 }, { assetAllocationRevision: { $exists: false } }] }
        : { assetAllocationRevision: revision };
    const updated = await Expense.findOneAndUpdate(
      { _id: id, ...revisionFilter },
      { $set: update, $inc: { assetAllocationRevision: 1 } },
      { new: true, runValidators: true }
    )
      .populate("category", "name")
      .populate("department", "name")
      .populate("currency", "code name symbol rateToBase isBase")
      .populate("createdBy", "name email photoURL")
      .lean();
    if (!updated) {
      throw new Error("Expense changed while you were editing it; reload and try again");
    }

    if (previousReceiptKey && update.receiptKey !== previousReceiptKey) {
      await deleteObject(previousReceiptKey).catch(() => undefined);
    }

    return NextResponse.json({ expense: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update expense";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  await connectDB();
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ error: "Expense id is invalid" }, { status: 400 });
  }
  const expense = await Expense.findById(id);

  if (!expense) {
    return NextResponse.json({ error: "Expense not found" }, { status: 404 });
  }

  if (authResult.role === "user" && expense.createdBy.toString() !== authResult._id) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const linkedAssetCount = await Asset.countDocuments({ purchaseExpense: id });
  if (linkedAssetCount > 0) {
    return NextResponse.json(
      { error: "This expense is linked to company assets and cannot be deleted" },
      { status: 409 }
    );
  }

  const revision = Number(expense.assetAllocationRevision || 0);
  const revisionCondition =
    revision === 0
      ? { $or: [{ assetAllocationRevision: 0 }, { assetAllocationRevision: { $exists: false } }] }
      : { assetAllocationRevision: revision };
  const deletion = await Expense.deleteOne({
    _id: expense._id,
    $and: [
      revisionCondition,
      {
        $or: [
          { assetAllocatedAmount: { $exists: false } },
          { assetAllocatedAmount: { $lte: 0 } },
        ],
      },
    ],
  });
  if (deletion.deletedCount !== 1) {
    return NextResponse.json(
      { error: "Expense or asset allocation changed; reload and try again" },
      { status: 409 }
    );
  }

  if (expense.receiptKey) {
    await deleteObject(expense.receiptKey).catch(() => undefined);
  }
  return NextResponse.json({ message: "Expense deleted" });
}
