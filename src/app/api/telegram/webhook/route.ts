import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import {
  claimTelegramUpdate,
  finishTelegramUpdate,
  getConnectedBot,
  matchWebhookSecret,
  retirePreviousWebhookSecret,
} from "@/lib/telegram-server";
import { handleTelegramUpdate } from "@/lib/telegram-bot";
import type { TelegramUpdate } from "@/lib/telegram";

export const runtime = "nodejs";
// Reading a receipt with the vision model can take a while; every outbound
// call has its own timeout well inside this budget.
export const maxDuration = 60;

// Telegram calls this for every message and button press sent to the bot. It
// authenticates with the secret token registered alongside the webhook, not a
// Firebase token, so it is the one API route without verifyAuth.
export async function POST(req: NextRequest) {
  await connectDB();
  const bot = await getConnectedBot();
  if (!bot) return NextResponse.json({ error: "Telegram bot is not configured" }, { status: 404 });

  const secret = matchWebhookSecret(bot, req.headers.get("x-telegram-bot-api-secret-token"));
  if (!secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (secret === "current") await retirePreviousWebhookSecret(bot);

  const update = (await req.json().catch(() => null)) as TelegramUpdate | null;
  if (!update || typeof update.update_id !== "number") {
    return NextResponse.json({ ok: true });
  }

  // Telegram redelivers an update it didn't get a 200 for in time; handle each once.
  if (!(await claimTelegramUpdate(bot.botId, update.update_id))) {
    return NextResponse.json({ ok: true });
  }

  await handleTelegramUpdate(update, bot);
  await finishTelegramUpdate(bot.botId, update.update_id);
  // Always acknowledge: failures are reported in the chat, and a non-2xx would
  // only make Telegram resend the same update.
  return NextResponse.json({ ok: true });
}
