import mongoose from "mongoose";
import Expense from "@/models/Expense";
import type { AuthUser } from "./auth";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseDateBoundary(value: string | null, endOfDay: boolean): Date | null {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  if (endOfDay) {
    date.setUTCHours(23, 59, 59, 999);
  } else {
    date.setUTCHours(0, 0, 0, 0);
  }

  return date;
}

function toObjectId(value: string | null): mongoose.Types.ObjectId | null {
  if (!value || !mongoose.isValidObjectId(value)) return null;
  return new mongoose.Types.ObjectId(value);
}

export function buildExpenseFilter(
  searchParams: URLSearchParams,
  user: AuthUser
): Record<string, unknown> {
  const filter: Record<string, unknown> = {};

  if (user.role === "user") {
    filter.createdBy = new mongoose.Types.ObjectId(user._id);
  }

  const department = toObjectId(searchParams.get("department"));
  const category = toObjectId(searchParams.get("category"));
  const search = searchParams.get("search")?.trim();
  const from = parseDateBoundary(searchParams.get("from"), false);
  const to = parseDateBoundary(searchParams.get("to"), true);

  if (department) filter.department = department;
  if (category) filter.category = category;

  if (search) {
    const regex = new RegExp(escapeRegExp(search), "i");
    filter.$or = [{ title: regex }, { description: regex }];
  }

  if (from || to) {
    filter.date = {
      ...(from ? { $gte: from } : {}),
      ...(to ? { $lte: to } : {}),
    };
  }

  return filter;
}

export async function getExpenseSummary(filter: Record<string, unknown>) {
  const [summary] = await Expense.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        totalExpenses: { $sum: 1 },
        totalAmount: { $sum: { $ifNull: ["$amountInBaseCurrency", "$amount"] } },
      },
    },
  ]);

  return {
    totalExpenses: summary?.totalExpenses ?? 0,
    totalAmount: summary?.totalAmount ?? 0,
  };
}
