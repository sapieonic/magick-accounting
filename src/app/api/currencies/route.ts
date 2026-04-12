import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, requireAdmin } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Currency from "@/models/Currency";

export async function GET(req: NextRequest) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  await connectDB();
  const currencies = await Currency.find({ isActive: true })
    .sort({ isBase: -1, code: 1 })
    .lean();

  return NextResponse.json({ currencies });
}

export async function POST(req: NextRequest) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;
  const adminCheck = requireAdmin(authResult);
  if (adminCheck) return adminCheck;

  try {
    await connectDB();
    const { code, name, symbol, rateToBase } = await req.json();

    if (!code || !name || !symbol || rateToBase == null) {
      return NextResponse.json({ error: "code, name, symbol, and rateToBase are required" }, { status: 400 });
    }

    if (!/^[A-Z]{3}$/.test(code.toUpperCase())) {
      return NextResponse.json({ error: "Currency code must be exactly 3 letters" }, { status: 400 });
    }

    if (rateToBase <= 0) {
      return NextResponse.json({ error: "Exchange rate must be greater than 0" }, { status: 400 });
    }

    const currency = await Currency.create({
      code: code.toUpperCase(),
      name,
      symbol,
      rateToBase,
      isBase: false,
      isActive: true,
      createdBy: authResult._id,
    });

    return NextResponse.json({ currency }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create currency";
    if (message.includes("duplicate key") || message.includes("E11000")) {
      return NextResponse.json({ error: "A currency with this code already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
