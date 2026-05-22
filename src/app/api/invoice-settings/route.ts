import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, requireAdmin } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import InvoiceSettings from "@/models/InvoiceSettings";

const FIELDS = [
  "sellerName",
  "sellerAddress",
  "sellerGstin",
  "bankAccountName",
  "bankAccountNumber",
  "bankAccountType",
  "bankIfsc",
] as const;

type SettingsShape = Record<(typeof FIELDS)[number], string>;

function pick(source: Record<string, unknown>): SettingsShape {
  return Object.fromEntries(
    FIELDS.map((f) => [f, typeof source[f] === "string" ? source[f] : ""])
  ) as SettingsShape;
}

export async function GET(req: NextRequest) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;
  const adminCheck = requireAdmin(authResult);
  if (adminCheck) return adminCheck;

  await connectDB();
  const doc = await InvoiceSettings.findOne({ key: "default" }).lean();
  return NextResponse.json({ settings: pick((doc ?? {}) as Record<string, unknown>) });
}

export async function PUT(req: NextRequest) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;
  const adminCheck = requireAdmin(authResult);
  if (adminCheck) return adminCheck;

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const update = pick(body);
    // Address may be multi-line; trim the rest.
    for (const f of FIELDS) {
      if (f !== "sellerAddress") update[f] = update[f].trim();
    }

    await connectDB();
    const doc = await InvoiceSettings.findOneAndUpdate(
      { key: "default" },
      { $set: update },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    return NextResponse.json({ settings: pick((doc ?? {}) as Record<string, unknown>) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save invoice settings";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
