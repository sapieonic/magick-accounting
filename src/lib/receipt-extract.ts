import { connectDB } from "@/lib/mongodb";
import Category from "@/models/Category";
import Currency from "@/models/Currency";
import { callDatabricksClaude, parseJsonResponse, type ContentBlock } from "@/lib/databricks";
import { renderPdfFirstPageToPng } from "@/lib/pdf";
import { isTravelType, TRAVEL_TYPES, type TravelType } from "@/lib/trip";

// Shared AI extraction used by the web auto-fill (/api/expenses/extract) and
// the Telegram bot.

export const RECEIPT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const RECEIPT_PDF_TYPE = "application/pdf";
export const RECEIPT_MAX_SIZE = 10 * 1024 * 1024; // 10MB

export function isExtractableReceiptType(mime: string): boolean {
  return RECEIPT_IMAGE_TYPES.includes(mime) || mime === RECEIPT_PDF_TYPE;
}

/** Thrown when the source can't be read (bad PDF, unparseable model output). */
export class ReceiptExtractionError extends Error {}

interface RawExtraction {
  title?: string | null;
  amount?: number | string | null;
  gstAmount?: number | string | null;
  currencyCode?: string | null;
  category?: string | null;
  date?: string | null;
  description?: string | null;
  travelType?: string | null;
}

export interface ExtractedExpense {
  title: string;
  amount: number | null;
  gstAmount: number | null;
  /** YYYY-MM-DD; today when the source shows no date. */
  date: string;
  description: string;
  currency: string | null;
  category: string | null;
  travelType: TravelType | null;
}

export type ExtractionSource =
  | { kind: "file"; buffer: Buffer; mime: string; note?: string }
  | { kind: "text"; text: string };

function today(): string {
  return new Date().toISOString().split("T")[0];
}

function buildInstruction(
  subject: string,
  currencyCodes: string[],
  categoryNames: string[],
  date: string
): string {
  return `You are an assistant that extracts structured expense data from ${subject}.
Return ONLY a JSON object (no markdown, no commentary) with exactly these keys:
- "title": a short descriptive title for the expense (merchant name and/or what was purchased)
- "amount": the total amount paid (grand total, inclusive of any tax) as a plain number, no currency symbol or thousands separators
- "gstAmount": the total GST/tax amount included in that total as a plain number (sum CGST + SGST + IGST if shown separately), or null if no GST/tax is shown. It must never be greater than "amount"
- "currencyCode": the ISO 4217 currency code. Must be one of [${currencyCodes.join(", ")}], or null if it cannot be determined
- "category": the single best-matching category. Must be exactly one of [${categoryNames.join(", ")}], or null if none clearly fits
- "date": the receipt/transaction date in YYYY-MM-DD format. Use "${date}" if no date is visible
- "description": a brief summary of the line items or purpose of the expense
- "travelType": if this is a business-travel expense, the single best-matching kind. Must be exactly one of [${TRAVEL_TYPES.join(", ")}] ("cab" covers taxis and local rides, "stay" hotels and lodging, "client_meeting" meals or costs of meeting a client, "visa" visa and travel fees), or null if it is not travel-related or none clearly fits
If a value cannot be determined, use null (except "date"). Never invent values.`;
}

/** A real calendar date as YYYY-MM-DD (rejects e.g. 2026-02-31 or 2026-13-45). */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function toNumber(value: unknown): number {
  return typeof value === "number" ? value : parseFloat(String(value ?? ""));
}

/** Maps raw model output onto real category/currency ids and sane values. */
export function normalizeExtraction(
  parsed: RawExtraction,
  categories: { _id: unknown; name: string }[],
  currencies: { _id: unknown; code: string }[],
  fallbackDate = today()
): ExtractedExpense {
  const currency = currencies.find(
    (c) =>
      typeof parsed.currencyCode === "string" &&
      c.code.toUpperCase() === parsed.currencyCode.trim().toUpperCase()
  );
  const category = categories.find(
    (c) =>
      typeof parsed.category === "string" &&
      c.name.toLowerCase() === parsed.category.trim().toLowerCase()
  );

  const amountNum = toNumber(parsed.amount);
  const amount = Number.isFinite(amountNum) && amountNum >= 0 ? amountNum : null;

  // GST is a portion of the total, so only accept it when it's a valid
  // non-negative number that doesn't exceed the extracted amount.
  const gstNum = toNumber(parsed.gstAmount);
  const gstAmount =
    Number.isFinite(gstNum) && gstNum >= 0 && (amount == null || gstNum <= amount) ? gstNum : null;

  const travelType =
    typeof parsed.travelType === "string" ? parsed.travelType.trim().toLowerCase() : null;

  return {
    title: typeof parsed.title === "string" ? parsed.title.trim() : "",
    amount,
    gstAmount,
    date: isIsoDate(parsed.date) ? parsed.date : fallbackDate,
    description: typeof parsed.description === "string" ? parsed.description.trim() : "",
    currency: currency ? String(currency._id) : null,
    category: category ? String(category._id) : null,
    travelType: travelType && isTravelType(travelType) ? travelType : null,
  };
}

/**
 * Reads expense details from a receipt image/PDF or a free-text message using
 * the vision model. Throws ReceiptExtractionError when the input is unreadable.
 */
export async function extractExpense(source: ExtractionSource): Promise<ExtractedExpense> {
  // Read the file before touching the DB, so an unreadable PDF is reported as
  // such (422) even when something else is wrong.
  let image: { mime: string; buffer: Buffer } | null = null;
  if (source.kind === "file") {
    image = { mime: source.mime, buffer: source.buffer };
    // PDF receipts are rasterized to an image; the model only accepts images.
    if (source.mime === RECEIPT_PDF_TYPE) {
      try {
        image = { mime: "image/png", buffer: renderPdfFirstPageToPng(source.buffer) };
      } catch (err) {
        console.error("PDF rasterization error:", err);
        throw new ReceiptExtractionError("Could not read this PDF.");
      }
    }
  }

  await connectDB();
  const [categories, currencies] = await Promise.all([
    Category.find().select("name").lean(),
    Currency.find({ isActive: true }).select("code").lean(),
  ]);
  const categoryRows = categories as unknown as { _id: unknown; name: string }[];
  const currencyRows = currencies as unknown as { _id: unknown; code: string }[];
  const currencyCodes = currencyRows.map((c) => c.code);
  const categoryNames = categoryRows.map((c) => c.name);
  const date = today();

  const content: ContentBlock[] = [];
  if (source.kind === "file" && image) {
    content.push({
      type: "text",
      text: buildInstruction("a receipt image", currencyCodes, categoryNames, date),
    });
    if (source.note?.trim()) {
      content.push({
        type: "text",
        text: `The person who sent this receipt added this note, which may help with the title, description or category:\n"""${source.note.trim()}"""`,
      });
    }
    content.push({
      type: "image_url",
      image_url: { url: `data:${image.mime};base64,${image.buffer.toString("base64")}` },
    });
  } else if (source.kind === "text") {
    const instruction = buildInstruction(
      "a text message (for example a forwarded payment confirmation, booking email or note)",
      currencyCodes,
      categoryNames,
      date
    );
    content.push({ type: "text", text: `${instruction}\n\nThe message:\n"""${source.text}"""` });
  }

  const raw = await callDatabricksClaude(content);
  let parsed: RawExtraction;
  try {
    parsed = parseJsonResponse<RawExtraction>(raw);
  } catch {
    throw new ReceiptExtractionError("Could not read details from this receipt.");
  }
  return normalizeExtraction(parsed, categoryRows, currencyRows, date);
}
