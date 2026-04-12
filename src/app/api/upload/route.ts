import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { getUploadUrl, getDownloadUrl } from "@/lib/s3";
function generateId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function POST(req: NextRequest) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { filename, contentType } = await req.json();

    if (!filename || !contentType) {
      return NextResponse.json({ error: "filename and contentType are required" }, { status: 400 });
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowedTypes.includes(contentType)) {
      return NextResponse.json(
        { error: "File type not allowed. Accepted: JPEG, PNG, WebP, PDF" },
        { status: 400 }
      );
    }

    const ext = filename.split(".").pop();
    const key = `receipts/${authResult._id}/${generateId()}.${ext}`;

    const uploadUrl = await getUploadUrl(key, contentType);

    return NextResponse.json({ uploadUrl, key });
  } catch {
    return NextResponse.json({ error: "Failed to generate upload URL" }, { status: 500 });
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
