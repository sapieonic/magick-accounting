import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { uploadObject, getDownloadUrl } from "@/lib/s3";

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
    const downloadUrl = await getDownloadUrl(key);
    return NextResponse.json({ downloadUrl });
  } catch {
    return NextResponse.json({ error: "Failed to generate download URL" }, { status: 500 });
  }
}
