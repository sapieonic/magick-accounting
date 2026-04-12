import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, requireMasterAdmin } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;
  const masterCheck = requireMasterAdmin(authResult);
  if (masterCheck) return masterCheck;

  await connectDB();
  const { id } = await params;
  const { role } = await req.json();

  if (!["admin", "user"].includes(role)) {
    return NextResponse.json({ error: "Invalid role. Must be 'admin' or 'user'" }, { status: 400 });
  }

  const user = await User.findById(id);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (user.role === "master_admin") {
    return NextResponse.json({ error: "Cannot change the master admin's role" }, { status: 400 });
  }

  user.role = role;
  await user.save();

  return NextResponse.json({ user: { _id: user._id, email: user.email, name: user.name, role: user.role } });
}
