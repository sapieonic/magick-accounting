import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { buildExpenseFilter, getExpenseSummary, parsePaidByParam } from "@/lib/expense-query";
import { buildPaymentFields, normalizeGstAmount, normalizePaymentSplit } from "@/lib/expense";
import { assertPayersExist } from "@/lib/expense-server";
import { normalizeTravelType } from "@/lib/trip";
import { resolveTripAssignment } from "@/lib/trip-server";
import {
  getGroupedExpensePage,
  populateExpenseRefs,
  withLinkedAssetCounts,
} from "@/lib/trip-query";
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
  const summaryPromise = includeSummary
    ? getExpenseSummary(filter, parsePaidByParam(searchParams, authResult))
    : Promise.resolve(null);

  if (searchParams.get("groupTrips") === "true") {
    // Each trip is one item (its expenses never split across pages), so
    // page/limit count items rather than expenses.
    const itemPage = Number.isFinite(page) && page > 0 ? page : 1;
    const itemLimit = Number.isFinite(limit) && limit > 0 ? limit : 20;
    const [grouped, summary] = await Promise.all([
      getGroupedExpensePage(filter, itemPage, itemLimit),
      summaryPromise,
    ]);
    return NextResponse.json({
      expenses: grouped.expenses,
      trips: grouped.trips,
      pagination: {
        page: itemPage,
        limit: itemLimit,
        total: grouped.total,
        pages: Math.ceil(grouped.total / itemLimit),
      },
      ...(summary ? { summary } : {}),
    });
  }

  const [expenses, total, summary] = await Promise.all([
    populateExpenseRefs(Expense.find(filter))
      .sort({ date: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Expense.countDocuments(filter),
    summaryPromise,
  ]);

  return NextResponse.json({
    expenses: await withLinkedAssetCounts(expenses),
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

    // Validate GST and the payment split (both parts of the total) before touching the DB.
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error("Expense amount must be a non-negative number");
    }
    const gstAmount = normalizeGstAmount(body.gstAmount, amount);
    const paymentSplit = normalizePaymentSplit(
      body.paymentSource,
      body.pocketAmount,
      amount,
      body.payments
    );
    await assertPayersExist(paymentSplit);
    // A travel type only means something inside a trip.
    const travelType = normalizeTravelType(body.travelType);
    const trip = (await resolveTripAssignment(body.trip, authResult)) ?? null;
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

    const amountInBaseCurrency = roundMoney(amount * rateToBase);

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
            amountInBaseCurrency,
            gstAmountInBaseCurrency:
              gstAmount != null ? roundMoney(gstAmount * rateToBase) : null,
            exchangeRateToBase: rateToBase,
            category: body.category,
            department: body.department,
            date: purchaseDate,
            description: body.description || "",
            ...buildPaymentFields(paymentSplit, amountInBaseCurrency, rateToBase),
            receiptKey: body.receiptKey || undefined,
            receiptFilename: body.receiptKey ? body.receiptFilename : undefined,
            trip,
            travelType: trip ? travelType : null,
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

    const populated = await populateExpenseRefs(Expense.findById(result.expenseId)).lean();

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
