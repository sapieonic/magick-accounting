import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, verifyAuth } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import AssetEvent from "@/models/AssetEvent";
import "@/models/User";

function positiveInteger(value: string | null, fallback: number, label: string): number {
  if (value == null) return fallback;
  if (!/^\d+$/.test(value) || Number(value) < 1) throw new Error(`${label} must be a positive integer`);
  return Number(value);
}

export async function GET(req: NextRequest) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;
  const adminCheck = requireAdmin(authResult);
  if (adminCheck) return adminCheck;

  try {
    const { searchParams } = new URL(req.url);
    const page = positiveInteger(searchParams.get("page"), 1, "Page");
    const limit = Math.min(100, positiveInteger(searchParams.get("limit"), 20, "Limit"));
    await connectDB();
    const filter = { type: "reversed" };
    const [corrections, total] = await Promise.all([
      AssetEvent.find(filter)
        .select("assetTag purchaseExpense reason occurredAt actor")
        .populate("actor", "name email")
        .sort({ occurredAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      AssetEvent.countDocuments(filter),
    ]);
    return NextResponse.json({
      corrections,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load corrections";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
