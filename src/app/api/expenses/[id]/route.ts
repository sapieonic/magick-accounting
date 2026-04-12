import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Expense from "@/models/Expense";
import Currency from "@/models/Currency";
import "@/models/Category";
import "@/models/Department";
import "@/models/User";
import { deleteObject } from "@/lib/s3";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  await connectDB();
  const { id } = await params;
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

  return NextResponse.json({ expense });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  await connectDB();
  const { id } = await params;
  const expense = await Expense.findById(id);

  if (!expense) {
    return NextResponse.json({ error: "Expense not found" }, { status: 404 });
  }

  if (authResult.role === "user" && expense.createdBy.toString() !== authResult._id) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  try {
    const body = await req.json();

    // Recompute amountInBaseCurrency if amount or currency changed
    const newAmount = body.amount !== undefined ? body.amount : expense.amount;
    const newCurrencyId = body.currency || expense.currency;

    if (newCurrencyId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const curr: any = await Currency.findById(newCurrencyId).lean();
      if (curr) {
        body.amountInBaseCurrency = newAmount * curr.rateToBase;
      }
    }

    const updated = await Expense.findByIdAndUpdate(id, body, { new: true, runValidators: true })
      .populate("category", "name")
      .populate("department", "name")
      .populate("currency", "code name symbol rateToBase isBase")
      .populate("createdBy", "name email photoURL")
      .lean();

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
  const expense = await Expense.findById(id);

  if (!expense) {
    return NextResponse.json({ error: "Expense not found" }, { status: 404 });
  }

  if (authResult.role === "user" && expense.createdBy.toString() !== authResult._id) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  if (expense.receiptKey) {
    try {
      await deleteObject(expense.receiptKey);
    } catch {
      // Continue with deletion even if S3 cleanup fails
    }
  }

  await Expense.findByIdAndDelete(id);
  return NextResponse.json({ message: "Expense deleted" });
}
