import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Category from "@/models/Category";

export async function GET(req: NextRequest) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  await connectDB();
  const categories = await Category.find()
    .sort({ isDefault: -1, name: 1 })
    .lean();

  return NextResponse.json({ categories });
}

export async function POST(req: NextRequest) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  try {
    await connectDB();
    const body = await req.json();

    const category = await Category.create({
      name: body.name,
      isDefault: false,
      createdBy: authResult._id,
    });

    return NextResponse.json({ category }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create category";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
