import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import {
  extractExpense,
  isExtractableReceiptType,
  RECEIPT_MAX_SIZE,
  ReceiptExtractionError,
} from "@/lib/receipt-extract";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (file.size > RECEIPT_MAX_SIZE) {
      return NextResponse.json({ error: "File too large. Maximum size is 10MB." }, { status: 400 });
    }
    if (!isExtractableReceiptType(file.type)) {
      return NextResponse.json(
        {
          error:
            "AI auto-fill supports image (JPEG, PNG, WebP) and PDF receipts. Please fill the form manually for other file types.",
        },
        { status: 415 }
      );
    }

    const extracted = await extractExpense({
      kind: "file",
      buffer: Buffer.from(await file.arrayBuffer()),
      mime: file.type,
    });
    return NextResponse.json(extracted);
  } catch (err) {
    if (err instanceof ReceiptExtractionError) {
      return NextResponse.json(
        { error: `${err.message} Please fill the form manually.` },
        { status: 422 }
      );
    }
    console.error("Receipt extraction error:", err);
    const message = err instanceof Error ? err.message : "Failed to read receipt";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
