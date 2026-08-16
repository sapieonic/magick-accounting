import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { buildExpenseFilter, getExpenseSummary } from "@/lib/expense-query";
import { normalizeGstAmount } from "@/lib/expense";
import { roundMoney } from "@/lib/asset";
import {
  AssetCreationReservation,
  compensateAssetCreation,
  createAssetsForExpense,
  ensureAssetIndexes,
} from "@/lib/asset-server";
import { runInTransaction, sessionOptions } from "@/lib/mongodb-transaction";
import { assertReceiptOwnedByUser } from "@/lib/receipt";
import Expense from "@/models/Expense";
import Currency from "@/models/Currency";
import Asset from "@/models/Asset";
import mongoose from "mongoose";
import "@/models/Category";
import "@/models/Department";

export async function GET(req: NextRequest) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  await connectDB();
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");
  const includeSummary = searchParams.get("includeSummary") === "true";
  const filter = buildExpenseFilter(searchParams, authResult);

  const [expenses, total, summary] = await Promise.all([
    Expense.find(filter)
      .populate("category", "name")
      .populate("department", "name")
      .populate("currency", "code name symbol rateToBase isBase")
      .populate("createdBy", "name email photoURL")
      .sort({ date: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Expense.countDocuments(filter),
    includeSummary ? getExpenseSummary(filter) : Promise.resolve(null),
  ]);

  const expenseIds = expenses.map((expense) => expense._id);
  const linkedAssetCounts = expenseIds.length > 0
    ? await Asset.aggregate([
        { $match: { purchaseExpense: { $in: expenseIds } } },
        { $group: { _id: "$purchaseExpense", count: { $sum: 1 } } },
      ])
    : [];
  const assetCountByExpense = new Map(
    linkedAssetCounts.map((row) => [String(row._id), row.count])
  );
  const expensesWithAssets = expenses.map((expense) => ({
    ...expense,
    linkedAssetCount: assetCountByExpense.get(String(expense._id)) || 0,
  }));

  return NextResponse.json({
    expenses: expensesWithAssets,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    ...(summary ? { summary } : {}),
  });
}

export async function POST(req: NextRequest) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  let createdExpenseId: mongoose.Types.ObjectId | null = null;
  let creationCompleted = false;
  const reservation: AssetCreationReservation = {
    batchId: new mongoose.Types.ObjectId().toString(),
    amount: 0,
    gstAmount: 0,
    reserved: false,
    transactional: true,
  };

  try {
    await connectDB();
    const body = await req.json();
    const rawAssets = body.assets;
    assertReceiptOwnedByUser(body.receiptKey, authResult._id);
    if (body.receiptKey && (await Expense.exists({ receiptKey: body.receiptKey }))) {
      throw new Error("Receipt is already attached to another expense");
    }

    // Validate GST (a component of the total) before touching the DB.
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error("Expense amount must be a non-negative number");
    }
    const gstAmount = normalizeGstAmount(body.gstAmount, amount);
    const purchaseDate = new Date(body.date);
    if (Number.isNaN(purchaseDate.getTime())) throw new Error("Expense date is invalid");

    // Resolve currency and compute the base-currency values at the entry rate.
    let currencyId = body.currency;
    let rateToBase = 1;

    if (currencyId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const curr: any = await Currency.findById(currencyId).lean();
      if (!curr) throw new Error("Currency is invalid");
      rateToBase = curr.rateToBase;
    } else {
      // Default to base currency
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const baseCurr: any = await Currency.findOne({ isBase: true }).lean();
      if (baseCurr) {
        currencyId = baseCurr._id;
      }
    }

    await ensureAssetIndexes();
    const result = await runInTransaction(async (session, transactional) => {
      reservation.transactional = transactional;
      const [expense] = await Expense.create(
        [
          {
            title: body.title,
            amount,
            gstAmount,
            currency: currencyId,
            amountInBaseCurrency: roundMoney(amount * rateToBase),
            gstAmountInBaseCurrency:
              gstAmount != null ? roundMoney(gstAmount * rateToBase) : null,
            exchangeRateToBase: rateToBase,
            category: body.category,
            department: body.department,
            date: purchaseDate,
            description: body.description || "",
            paymentSource: body.paymentSource,
            receiptKey: body.receiptKey || undefined,
            receiptFilename: body.receiptKey ? body.receiptFilename : undefined,
            createdBy: authResult._id,
          },
        ],
        sessionOptions(session)
      );
      createdExpenseId = expense._id;
      await createAssetsForExpense({
        rawAssets,
        expense,
        authUser: authResult,
        rateToBase,
        session,
        reservation,
      });
      return { expenseId: expense._id };
    });
    creationCompleted = true;

    const createdAssets = await Asset.find({ purchaseExpense: result.expenseId })
        .populate("assignedTo", "name email photoURL")
        .populate("department", "name")
        .sort({ assetTag: 1 })
        .lean();

    const populated = await Expense.findById(result.expenseId)
      .populate("category", "name")
      .populate("department", "name")
      .populate("currency", "code name symbol rateToBase isBase")
      .populate("createdBy", "name email photoURL")
      .lean();

    return NextResponse.json({ expense: populated, assets: createdAssets }, { status: 201 });
  } catch (err) {
    if (creationCompleted && createdExpenseId) {
      return NextResponse.json(
        {
          expense: { _id: createdExpenseId },
          assets: [],
          warning: "Expense was created, but its populated response could not be loaded",
        },
        { status: 201 }
      );
    }
    // Keep the linked-entry experience atomic even on MongoDB deployments
    // without replica-set transactions by compensating for partial writes.
    if (createdExpenseId) {
      try {
        await compensateAssetCreation(createdExpenseId, reservation);
        if (!reservation.transactional) {
          await Expense.deleteOne({ _id: createdExpenseId }).catch(() => undefined);
        }
      } catch {
        // Preserve the original validation/write error even if best-effort
        // cleanup cannot reach MongoDB.
      }
    }
    const message = err instanceof Error ? err.message : "Failed to create expense";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
