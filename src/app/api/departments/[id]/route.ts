import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, requireAdmin } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Department from "@/models/Department";
import Expense from "@/models/Expense";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;
  const adminCheck = requireAdmin(authResult);
  if (adminCheck) return adminCheck;

  await connectDB();
  const { id } = await params;

  try {
    const body = await req.json();
    const department = await Department.findByIdAndUpdate(id, body, { new: true, runValidators: true }).lean();

    if (!department) {
      return NextResponse.json({ error: "Department not found" }, { status: 404 });
    }

    return NextResponse.json({ department });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update department";
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
  const department = await Department.findById(id);

  if (!department) {
    return NextResponse.json({ error: "Department not found" }, { status: 404 });
  }

  if (department.isDefault) {
    return NextResponse.json({ error: "Cannot delete the default department" }, { status: 400 });
  }

  const expenseCount = await Expense.countDocuments({ department: id });
  if (expenseCount > 0) {
    return NextResponse.json(
      { error: `Cannot delete department with ${expenseCount} expense(s). Move or delete them first.` },
      { status: 400 }
    );
  }

  await Department.findByIdAndDelete(id);
  return NextResponse.json({ message: "Department deleted" });
}
