import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Expense from "@/models/Expense";
import Currency from "@/models/Currency";
import "@/models/Category";
import "@/models/Department";
import "@/models/User";

export async function GET(req: NextRequest) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  await connectDB();
  const { searchParams } = new URL(req.url);
  const department = searchParams.get("department");
  const category = searchParams.get("category");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");

  const filter: Record<string, unknown> = {};

  if (authResult.role === "user") {
    filter.createdBy = authResult._id;
  }
  if (department) filter.department = department;
  if (category) filter.category = category;

  const [expenses, total] = await Promise.all([
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
  ]);

  return NextResponse.json({
    expenses,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

export async function POST(req: NextRequest) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  try {
    await connectDB();
    const body = await req.json();

    // Resolve currency and compute amountInBaseCurrency
    let currencyId = body.currency;
    let amountInBaseCurrency = body.amount;

    if (currencyId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const curr: any = await Currency.findById(currencyId).lean();
      if (curr) {
        amountInBaseCurrency = body.amount * curr.rateToBase;
      }
    } else {
      // Default to base currency
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const baseCurr: any = await Currency.findOne({ isBase: true }).lean();
      if (baseCurr) {
        currencyId = baseCurr._id;
      }
    }

    const expense = await Expense.create({
      ...body,
      currency: currencyId,
      amountInBaseCurrency,
      createdBy: authResult._id,
    });

    const populated = await Expense.findById(expense._id)
      .populate("category", "name")
      .populate("department", "name")
      .populate("currency", "code name symbol rateToBase isBase")
      .populate("createdBy", "name email photoURL")
      .lean();

    return NextResponse.json({ expense: populated }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create expense";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
