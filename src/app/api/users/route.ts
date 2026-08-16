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
        _id: {
          user: "$createdBy",
          source: { $cond: [{ $eq: ["$paymentSource", "company"] }, "company", "pocket"] },
        },
        total: { $sum: { $ifNull: ["$amountInBaseCurrency", "$amount"] } },
      },
    },
  ]);

  interface SpendBreakdown {
    totalSpend: number;
    companySpend: number;
    pocketSpend: number;
  }

  const spendMap = userSpends.reduce((acc, curr) => {
    const userId = String(curr._id.user);
    if (!acc[userId]) {
      acc[userId] = { totalSpend: 0, companySpend: 0, pocketSpend: 0 };
    }
    const amount = curr.total || 0;
    if (curr._id.source === "company") {
      acc[userId].companySpend += amount;
    } else {
      acc[userId].pocketSpend += amount;
    }
    acc[userId].totalSpend += amount;
    return acc;
  }, {} as Record<string, SpendBreakdown>);

  const emptySpend: SpendBreakdown = { totalSpend: 0, companySpend: 0, pocketSpend: 0 };

  const usersWithSpend = users.map((user: any) => ({
    ...user,
    ...(spendMap[String(user._id)] || emptySpend),
  }));

  return NextResponse.json({ users: usersWithSpend });
}
