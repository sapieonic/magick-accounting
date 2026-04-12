import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Department from "@/models/Department";

export async function GET(req: NextRequest) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  await connectDB();
  const departments = await Department.find()
    .populate("createdBy", "name email")
    .sort({ isDefault: -1, name: 1 })
    .lean();

  return NextResponse.json({ departments });
}

export async function POST(req: NextRequest) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  try {
    await connectDB();
    const body = await req.json();

    const department = await Department.create({
      ...body,
      createdBy: authResult._id,
    });

    return NextResponse.json({ department }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create department";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
