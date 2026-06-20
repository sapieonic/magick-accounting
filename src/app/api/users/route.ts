import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, requireAdmin } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import Expense from "@/models/Expense";

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

  const userSpends = await Expense.aggregate([
    {
      $group: {
        _id: "$createdBy",
        totalSpend: { $sum: { $ifNull: ["$amountInBaseCurrency", "$amount"] } },
      },
    },
  ]);

  const spendMap = userSpends.reduce((acc, curr) => {
    acc[curr._id.toString()] = curr.totalSpend;
    return acc;
  }, {} as Record<string, number>);

  const usersWithSpend = users.map((user: any) => ({
    ...user,
    totalSpend: spendMap[String(user._id)] || 0,
  }));

  return NextResponse.json({ users: usersWithSpend });
}
