import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { verifyAuth, requireAdmin } from "@/lib/auth";
import { ReceiptDocument } from "@/components/invoice/ReceiptDocument";
import { parseReceipt } from "@/lib/invoice";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  const adminCheck = requireAdmin(authResult);
  if (adminCheck) return adminCheck;

  try {
    const body = await req.json().catch(() => null);
    const parsed = parseReceipt(body);
    if (typeof parsed === "string") {
      return NextResponse.json({ error: parsed }, { status: 400 });
    }

    const buffer = await renderToBuffer(<ReceiptDocument data={parsed} />);
    const safeName = parsed.receiptNumber.replace(/[^a-zA-Z0-9._-]/g, "_");

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="receipt-${safeName}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("Receipt generation error:", err);
    const message = err instanceof Error ? err.message : "Failed to generate receipt";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
