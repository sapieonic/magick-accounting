import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { uploadObject, getDownloadUrl, deleteObject } from "@/lib/s3";
import { connectDB } from "@/lib/mongodb";
import Expense from "@/models/Expense";

function generateId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(req: NextRequest) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File too large. Maximum size is 10MB." }, { status: 400 });
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "File type not allowed. Accepted: JPEG, PNG, WebP, PDF" },
        { status: 400 }
      );
    }

    const ext = file.name.split(".").pop();
    const key = `receipts/${authResult._id}/${generateId()}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    await uploadObject(key, buffer, file.type);

    return NextResponse.json({ key, filename: file.name }, { status: 201 });
  } catch (err) {
    console.error("Upload error:", err);
    const message = err instanceof Error ? err.message : "Failed to upload file";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");

  if (!key) {
    return NextResponse.json({ error: "key parameter is required" }, { status: 400 });
  }

  try {
    await connectDB();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const expense: any = await Expense.findOne({ receiptKey: key }).select("createdBy").lean();
    if (!expense) {
      return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    }
    if (authResult.role === "user" && String(expense.createdBy) !== authResult._id) {
      return NextResponse.json({ error: "Not authorized to access this receipt" }, { status: 403 });
    }
    const downloadUrl = await getDownloadUrl(key);
    return NextResponse.json({ downloadUrl });
  } catch {
    return NextResponse.json({ error: "Failed to generate download URL" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  const key = new URL(req.url).searchParams.get("key");
  if (!key) return NextResponse.json({ error: "key parameter is required" }, { status: 400 });

  // This endpoint only cleans up an upload that has not yet been attached to
  // an expense. A user may clean up only their own upload prefix.
  const expectedPrefix = `receipts/${authResult._id}/`;
  if (!key.startsWith(expectedPrefix)) {
    return NextResponse.json({ error: "Not authorized to delete this upload" }, { status: 403 });
  }

  await connectDB();
  if (await Expense.exists({ receiptKey: key })) {
    return NextResponse.json({ error: "Attached receipts cannot be deleted directly" }, { status: 409 });
  }

  try {
    await deleteObject(key);
    return NextResponse.json({ message: "Upload deleted" });
  } catch {
    return NextResponse.json({ error: "Failed to delete upload" }, { status: 500 });
  }
}
