import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, requireAdmin } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import InvoiceSettings from "@/models/InvoiceSettings";

const STRING_FIELDS = [
  "sellerName",
  "sellerAddress",
  "sellerGstin",
  "hsnSac",
  "bankAccountName",
  "bankAccountNumber",
  "bankAccountType",
  "bankIfsc",
] as const;

const NUMBER_FIELDS = ["cgstRate", "sgstRate"] as const;

// Default tax rates used when none have been saved yet (or stored on legacy docs).
const DEFAULT_RATES: Record<(typeof NUMBER_FIELDS)[number], number> = {
  cgstRate: 9,
  sgstRate: 9,
};

type SettingsShape = Record<(typeof STRING_FIELDS)[number], string> &
  Record<(typeof NUMBER_FIELDS)[number], number>;

function pick(source: Record<string, unknown>): SettingsShape {
  const out = {} as SettingsShape;
  for (const f of STRING_FIELDS) {
    out[f] = typeof source[f] === "string" ? (source[f] as string) : "";
  }
  for (const f of NUMBER_FIELDS) {
    const n = Number(source[f]);
    // Honour an explicit value (including 0); fall back to the default when absent/invalid.
    out[f] = Number.isFinite(n) && n >= 0 ? n : DEFAULT_RATES[f];
  }
  return out;
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
    // Address may be multi-line; trim the rest of the string fields.
    for (const f of STRING_FIELDS) {
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
