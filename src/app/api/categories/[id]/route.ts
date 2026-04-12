import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, requireAdmin } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Category from "@/models/Category";
import Expense from "@/models/Expense";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;
  const adminCheck = requireAdmin(authResult);
  if (adminCheck) return adminCheck;

  await connectDB();
  const { id } = await params;
  const category = await Category.findById(id);

  if (!category) {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }

  if (category.isDefault) {
    return NextResponse.json({ error: "Cannot delete a default category" }, { status: 400 });
  }

  const expenseCount = await Expense.countDocuments({ category: id });
  if (expenseCount > 0) {
    return NextResponse.json(
      { error: `Cannot delete category with ${expenseCount} expense(s). Reassign them first.` },
      { status: 400 }
    );
  }

  await Category.findByIdAndDelete(id);
  return NextResponse.json({ message: "Category deleted" });
}
