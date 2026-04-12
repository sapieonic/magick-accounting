import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, requireAdmin } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import AllowedDomain from "@/models/AllowedDomain";

export async function GET(req: NextRequest) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;
  const adminCheck = requireAdmin(authResult);
  if (adminCheck) return adminCheck;

  await connectDB();
  const domains = await AllowedDomain.find()
    .populate("addedBy", "name email")
    .sort({ createdAt: 1 })
    .lean();

  return NextResponse.json({ domains });
}

export async function POST(req: NextRequest) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;
  const adminCheck = requireAdmin(authResult);
  if (adminCheck) return adminCheck;

  try {
    await connectDB();
    const { domain } = await req.json();

    if (!domain || !domain.includes(".")) {
      return NextResponse.json({ error: "Invalid domain format" }, { status: 400 });
    }

    const cleanDomain = domain.replace("@", "").toLowerCase().trim();

    const existing = await AllowedDomain.findOne({ domain: cleanDomain });
    if (existing) {
      return NextResponse.json({ error: "Domain already whitelisted" }, { status: 409 });
    }

    const newDomain = await AllowedDomain.create({
      domain: cleanDomain,
      addedBy: authResult._id,
    });

    return NextResponse.json({ domain: newDomain }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to add domain";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
