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

// Collects all valid ObjectIds for a param, supporting both repeated params
// (?category=a&category=b) and comma-separated values (?category=a,b).
function toObjectIds(searchParams: URLSearchParams, key: string): mongoose.Types.ObjectId[] {
  const ids: mongoose.Types.ObjectId[] = [];
  const seen = new Set<string>();

  for (const raw of searchParams.getAll(key)) {
    for (const part of raw.split(",")) {
      const trimmed = part.trim();
      if (!trimmed || seen.has(trimmed) || !mongoose.isValidObjectId(trimmed)) continue;
      seen.add(trimmed);
      ids.push(new mongoose.Types.ObjectId(trimmed));
    }
  }

  return ids;
}

export function buildExpenseFilter(
  searchParams: URLSearchParams,
  user: AuthUser
): Record<string, unknown> {
  const filter: Record<string, unknown> = {};

  if (user.role === "user") {
    filter.createdBy = new mongoose.Types.ObjectId(user._id);
  } else {
    const requestedCreatedBy = toObjectId(searchParams.get("createdBy"));
    if (requestedCreatedBy) {
      filter.createdBy = requestedCreatedBy;
    }
  }

  const departments = toObjectIds(searchParams, "department");
  const categories = toObjectIds(searchParams, "category");
  const search = searchParams.get("search")?.trim();
  const from = parseDateBoundary(searchParams.get("from"), false);
  const to = parseDateBoundary(searchParams.get("to"), true);

  if (departments.length === 1) filter.department = departments[0];
  else if (departments.length > 1) filter.department = { $in: departments };

  if (categories.length === 1) filter.category = categories[0];
  else if (categories.length > 1) filter.category = { $in: categories };

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
