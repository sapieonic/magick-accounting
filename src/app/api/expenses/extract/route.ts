import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Category from "@/models/Category";
import Currency from "@/models/Currency";
import { callDatabricksClaude, parseJsonResponse } from "@/lib/databricks";
import { renderPdfFirstPageToPng } from "@/lib/pdf";

export const runtime = "nodejs";

const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const PDF_TYPE = "application/pdf";

interface ExtractedReceipt {
  title?: string | null;
  amount?: number | string | null;
  currencyCode?: string | null;
  category?: string | null;
  date?: string | null;
  description?: string | null;
}

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
    if (!IMAGE_TYPES.includes(file.type) && file.type !== PDF_TYPE) {
      return NextResponse.json(
        {
          error:
            "AI auto-fill supports image (JPEG, PNG, WebP) and PDF receipts. Please fill the form manually for other file types.",
        },
        { status: 415 }
      );
    }

    // PDF receipts are rasterized to an image; the model only accepts images.
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    let imageMime = file.type;
    let imageBuffer: Buffer = fileBuffer;
    if (file.type === PDF_TYPE) {
      try {
        imageBuffer = renderPdfFirstPageToPng(fileBuffer);
        imageMime = "image/png";
      } catch (err) {
        console.error("PDF rasterization error:", err);
        return NextResponse.json(
          { error: "Could not read this PDF. Please fill the form manually." },
          { status: 422 }
        );
      }
    }

    await connectDB();
    const [categories, currencies] = await Promise.all([
      Category.find().select("name").lean(),
      Currency.find({ isActive: true }).select("code name symbol isBase").lean(),
    ]);

    const categoryNames = categories.map((c) => c.name as string);
    const currencyCodes = currencies.map((c) => c.code as string);
    const today = new Date().toISOString().split("T")[0];

    const dataUrl = `data:${imageMime};base64,${imageBuffer.toString("base64")}`;

    const instruction = `You are an assistant that extracts structured expense data from a receipt image.
Return ONLY a JSON object (no markdown, no commentary) with exactly these keys:
- "title": a short descriptive title for the expense (merchant name and/or what was purchased)
- "amount": the total amount paid as a plain number, no currency symbol or thousands separators
- "currencyCode": the ISO 4217 currency code. Must be one of [${currencyCodes.join(", ")}], or null if it cannot be determined
- "category": the single best-matching category. Must be exactly one of [${categoryNames.join(", ")}], or null if none clearly fits
- "date": the receipt/transaction date in YYYY-MM-DD format. Use "${today}" if no date is visible
- "description": a brief summary of the line items or purpose of the expense
If a value cannot be determined, use null (except "date"). Never invent values.`;

    const raw = await callDatabricksClaude([
      { type: "text", text: instruction },
      { type: "image_url", image_url: { url: dataUrl } },
    ]);

    let parsed: ExtractedReceipt;
    try {
      parsed = parseJsonResponse<ExtractedReceipt>(raw);
    } catch {
      return NextResponse.json(
        { error: "Could not read details from this receipt. Please fill the form manually." },
        { status: 422 }
      );
    }

    // Map extracted values to actual DB ids where possible.
    const currency = currencies.find(
      (c) =>
        typeof parsed.currencyCode === "string" &&
        (c.code as string).toUpperCase() === parsed.currencyCode.toUpperCase()
    );
    const category = categories.find(
      (c) =>
        typeof parsed.category === "string" &&
        (c.name as string).toLowerCase() === parsed.category.toLowerCase()
    );

    const amountNum =
      typeof parsed.amount === "number"
        ? parsed.amount
        : parseFloat(String(parsed.amount ?? ""));

    return NextResponse.json({
      title: typeof parsed.title === "string" ? parsed.title : "",
      amount: Number.isFinite(amountNum) && amountNum >= 0 ? amountNum : null,
      date:
        typeof parsed.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date)
          ? parsed.date
          : today,
      description: typeof parsed.description === "string" ? parsed.description : "",
      currency: currency?._id?.toString() ?? null,
      category: category?._id?.toString() ?? null,
    });
  } catch (err) {
    console.error("Receipt extraction error:", err);
    const message = err instanceof Error ? err.message : "Failed to read receipt";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
