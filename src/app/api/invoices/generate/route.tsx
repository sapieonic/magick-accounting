import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { verifyAuth, requireAdmin } from "@/lib/auth";
import { InvoiceDocument } from "@/components/invoice/InvoiceDocument";
import type { InvoiceData, InvoiceLineItem } from "@/types/invoice";

export const runtime = "nodejs";

const str = (v: unknown) => String(v ?? "").trim();
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Validates and normalizes the request body into a clean InvoiceData object. */
function parseInvoice(body: unknown): InvoiceData | string {
  if (!body || typeof body !== "object") return "Invalid request body";
  const b = body as Record<string, unknown>;

  const invoiceNumber = str(b.invoiceNumber);
  if (!invoiceNumber) return "Invoice number is required";

  const invoiceDate = str(b.invoiceDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) return "A valid invoice date is required";

  const dueDate = b.dueDate ? str(b.dueDate) : undefined;
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return "Due date is invalid";

  const seller = (b.seller ?? {}) as Record<string, unknown>;
  const customer = (b.customer ?? {}) as Record<string, unknown>;
  if (!str(seller.name)) return "Seller name is required";
  if (!str(customer.name)) return "Customer name is required";

  const lineItems: InvoiceLineItem[] = (Array.isArray(b.lineItems) ? b.lineItems : [])
    .map((it) => {
      const item = it as Record<string, unknown>;
      return {
        description: str(item.description),
        quantity: num(item.quantity),
        rate: num(item.rate),
        cgstRate: num(item.cgstRate),
        sgstRate: num(item.sgstRate),
      };
    })
    .filter((it) => it.description !== "");

  if (lineItems.length === 0) {
    return "At least one line item with a description is required";
  }

  const bank = (b.bank ?? {}) as Record<string, unknown>;

  return {
    invoiceNumber,
    invoiceDate,
    dueDate,
    terms: b.terms ? str(b.terms) : undefined,
    hsnSac: b.hsnSac ? str(b.hsnSac) : undefined,
    placeOfSupply: b.placeOfSupply ? str(b.placeOfSupply) : undefined,
    seller: {
      name: str(seller.name),
      address: str(seller.address),
      email: str(seller.email),
      gstin: str(seller.gstin),
    },
    customer: {
      name: str(customer.name),
      gstin: str(customer.gstin),
    },
    lineItems,
    bank: {
      accountName: str(bank.accountName),
      accountNumber: str(bank.accountNumber),
      accountType: str(bank.accountType),
      ifsc: str(bank.ifsc),
    },
  };
}

export async function POST(req: NextRequest) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  const adminCheck = requireAdmin(authResult);
  if (adminCheck) return adminCheck;

  try {
    const body = await req.json().catch(() => null);
    const parsed = parseInvoice(body);
    if (typeof parsed === "string") {
      return NextResponse.json({ error: parsed }, { status: 400 });
    }

    const buffer = await renderToBuffer(<InvoiceDocument data={parsed} />);
    const safeName = parsed.invoiceNumber.replace(/[^a-zA-Z0-9._-]/g, "_");

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="invoice-${safeName}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("Invoice generation error:", err);
    const message = err instanceof Error ? err.message : "Failed to generate invoice";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
