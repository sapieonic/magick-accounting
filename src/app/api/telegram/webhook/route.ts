import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getConnectedBot, secretMatches } from "@/lib/telegram-server";
import { handleTelegramUpdate } from "@/lib/telegram-bot";
import type { TelegramUpdate as TelegramUpdatePayload } from "@/lib/telegram";
import TelegramUpdate from "@/models/TelegramUpdate";

export const runtime = "nodejs";
// Reading a receipt with the vision model can take a while.
export const maxDuration = 60;

// Telegram calls this for every message and button press sent to the bot. It
// authenticates with the secret token registered alongside the webhook, not a
// Firebase token, so it is the one API route without verifyAuth.
export async function POST(req: NextRequest) {
  await connectDB();
  const bot = await getConnectedBot();
  if (!bot) return NextResponse.json({ error: "Telegram bot is not configured" }, { status: 404 });

  if (!secretMatches(bot.webhookSecret, req.headers.get("x-telegram-bot-api-secret-token"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const update = (await req.json().catch(() => null)) as TelegramUpdatePayload | null;
  if (!update || typeof update.update_id !== "number") {
    return NextResponse.json({ ok: true });
  }

  // Telegram redelivers an update it didn't get a 200 for in time; handle each once.
  try {
    await TelegramUpdate.create({ updateId: update.update_id });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return NextResponse.json({ ok: true });
    throw err;
  }

  await handleTelegramUpdate(update, bot);
  // Always acknowledge: failures are reported in the chat, and a non-2xx would
  // only make Telegram resend the same update.
  return NextResponse.json({ ok: true });
}
