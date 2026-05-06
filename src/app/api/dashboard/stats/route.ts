import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { verifyAuth } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { buildExpenseFilter, getExpenseSummary } from "@/lib/expense-query";
import Expense from "@/models/Expense";
import Department from "@/models/Department";
import Category from "@/models/Category";
import "@/models/Currency";
import "@/models/User";

export async function GET(req: NextRequest) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  await connectDB();
  const filter = buildExpenseFilter(new URL(req.url).searchParams, authResult);
  const recentFilter = {
    ...filter,
    createdBy: new mongoose.Types.ObjectId(authResult._id),
  };

  const [summary, departmentCount, categoryCount, recentExpenses] = await Promise.all([
    getExpenseSummary(filter),
    Department.countDocuments(),
    Category.countDocuments(),
    Expense.find(recentFilter)
      .populate("category", "name")
      .populate("department", "name")
      .populate("currency", "code name symbol rateToBase isBase")
      .sort({ date: -1 })
      .limit(5)
      .lean(),
  ]);

  return NextResponse.json({
    ...summary,
    departmentCount,
    categoryCount,
    recentExpenses,
  });
}
