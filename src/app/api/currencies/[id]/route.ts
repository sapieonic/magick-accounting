import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, requireAdmin } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Currency from "@/models/Currency";
import Expense from "@/models/Expense";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;
  const adminCheck = requireAdmin(authResult);
  if (adminCheck) return adminCheck;

  await connectDB();
  const { id } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currency: any = await Currency.findById(id);
  if (!currency) {
    return NextResponse.json({ error: "Currency not found" }, { status: 404 });
  }

  const body = await req.json();

  // Prevent changing the base currency's rate
  if (currency.isBase && body.rateToBase !== undefined && body.rateToBase !== 1) {
    return NextResponse.json({ error: "Cannot change the base currency's exchange rate" }, { status: 400 });
  }

  // Prevent changing isBase
  if (body.isBase !== undefined) {
    return NextResponse.json({ error: "Cannot change the base currency flag" }, { status: 400 });
  }

  if (body.rateToBase !== undefined && body.rateToBase <= 0) {
    return NextResponse.json({ error: "Exchange rate must be greater than 0" }, { status: 400 });
  }

  try {
    const allowedFields: Record<string, unknown> = {};
    if (body.name !== undefined) allowedFields.name = body.name;
    if (body.symbol !== undefined) allowedFields.symbol = body.symbol;
    if (body.rateToBase !== undefined) allowedFields.rateToBase = body.rateToBase;
    if (body.isActive !== undefined) allowedFields.isActive = body.isActive;

    const updated = await Currency.findByIdAndUpdate(id, allowedFields, { new: true, runValidators: true }).lean();
    return NextResponse.json({ currency: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update currency";
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currency: any = await Currency.findById(id);
  if (!currency) {
    return NextResponse.json({ error: "Currency not found" }, { status: 404 });
  }

  if (currency.isBase) {
    return NextResponse.json({ error: "Cannot delete the base currency" }, { status: 400 });
  }

  const expenseCount = await Expense.countDocuments({ currency: id });
  if (expenseCount > 0) {
    return NextResponse.json(
      { error: `Cannot delete currency with ${expenseCount} expense(s). Reassign them first.` },
      { status: 400 }
    );
  }

  await Currency.findByIdAndDelete(id);
  return NextResponse.json({ message: "Currency deleted" });
}
