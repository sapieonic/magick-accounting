import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, requireAdmin } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import {
  connectTelegramBot,
  describeTelegramSettings,
  disconnectTelegramBot,
  getTelegramSettings,
} from "@/lib/telegram-server";

export async function GET(req: NextRequest) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;
  const adminCheck = requireAdmin(authResult);
  if (adminCheck) return adminCheck;

  await connectDB();
  return NextResponse.json({ telegram: await describeTelegramSettings(await getTelegramSettings()) });
}

/** Connects or reconnects the bot; body `{ botToken?, appUrl }`. */
export async function PUT(req: NextRequest) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;
  const adminCheck = requireAdmin(authResult);
  if (adminCheck) return adminCheck;

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    await connectDB();
    const settings = await connectTelegramBot(body.botToken, body.appUrl, authResult._id);
    return NextResponse.json({ telegram: await describeTelegramSettings(settings) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to connect the Telegram bot";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;
  const adminCheck = requireAdmin(authResult);
  if (adminCheck) return adminCheck;

  await connectDB();
  return NextResponse.json({ telegram: await describeTelegramSettings(await disconnectTelegramBot()) });
}
