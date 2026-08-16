import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireAdmin, verifyAuth } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import AssetEvent from "@/models/AssetEvent";
import "@/models/User";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;
  const adminCheck = requireAdmin(authResult);
  if (adminCheck) return adminCheck;

  const { eventId } = await params;
  if (!mongoose.isValidObjectId(eventId)) {
    return NextResponse.json({ error: "Correction id is invalid" }, { status: 400 });
  }
  await connectDB();
  const correction = await AssetEvent.findOne({ _id: eventId, type: "reversed" })
    .populate("actor", "name email")
    .lean();
  if (!correction) {
    return NextResponse.json({ error: "Correction not found" }, { status: 404 });
  }
  return NextResponse.json({ correction });
}
