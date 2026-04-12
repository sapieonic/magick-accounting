import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, requireAdmin } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import AllowedDomain from "@/models/AllowedDomain";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;
  const adminCheck = requireAdmin(authResult);
  if (adminCheck) return adminCheck;

  await connectDB();
  const { id } = await params;

  const domainCount = await AllowedDomain.countDocuments();
  if (domainCount <= 1) {
    return NextResponse.json({ error: "Cannot remove the last allowed domain" }, { status: 400 });
  }

  const domain = await AllowedDomain.findByIdAndDelete(id);
  if (!domain) {
    return NextResponse.json({ error: "Domain not found" }, { status: 404 });
  }

  return NextResponse.json({ message: "Domain removed" });
}
