import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, requireAdmin } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import Expense from "@/models/Expense";
import { spendByPayerPipeline } from "@/lib/expense";

interface SpendBreakdown {
  totalSpend: number;
  companySpend: number;
  pocketSpend: number;
}

const EMPTY_SPEND: SpendBreakdown = { totalSpend: 0, companySpend: 0, pocketSpend: 0 };

export async function GET(req: NextRequest) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;
  const adminCheck = requireAdmin(authResult);
  if (adminCheck) return adminCheck;

  await connectDB();
  const users = await User.find()
    .select("-firebaseUid")
    .sort({ role: 1, name: 1 })
    .lean();

  const userSpends = await Expense.aggregate(spendByPayerPipeline);

  const spendMap = new Map<string, SpendBreakdown>(
    userSpends.map((row) => [
      String(row._id),
      {
        totalSpend: row.totalSpend || 0,
        companySpend: row.companySpend || 0,
        pocketSpend: row.pocketSpend || 0,
      },
    ])
  );

  const usersWithSpend = users.map((user: any) => ({
    ...user,
    ...(spendMap.get(String(user._id)) || EMPTY_SPEND),
  }));

  return NextResponse.json({ users: usersWithSpend });
}
