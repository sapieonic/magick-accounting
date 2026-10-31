import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, requireAdmin } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import {
  deleteWebhook,
  getMe,
  getWebhookInfo,
  isPlausibleBotToken,
  maskBotToken,
  setMyCommands,
  setWebhook,
  TelegramApiError,
} from "@/lib/telegram";
import {
  generateSecret,
  getTelegramSettings,
  normalizeAppUrl,
  webhookUrlFor,
} from "@/lib/telegram-server";
import TelegramSettings, { type ITelegramSettings } from "@/models/TelegramSettings";
import User from "@/models/User";

async function describe(settings: ITelegramSettings | null) {
  const linkedUsers = await User.countDocuments({ "telegram.userId": { $type: "number" } });
  if (!settings?.botToken) {
    return { configured: false, appUrl: settings?.appUrl ?? "", linkedUsers };
  }

  let webhook = null;
  let webhookError: string | null = null;
  try {
    const info = await getWebhookInfo(settings.botToken);
    webhook = {
      url: info.url,
      pendingUpdateCount: info.pending_update_count,
      lastErrorMessage: info.last_error_message ?? null,
      lastErrorDate: info.last_error_date ? new Date(info.last_error_date * 1000).toISOString() : null,
    };
  } catch (err) {
    webhookError = err instanceof Error ? err.message : "Could not reach Telegram";
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const connectedBy: any = settings.connectedBy
    ? await User.findById(settings.connectedBy).select("name email").lean()
    : null;

  return {
    configured: true,
    botUsername: settings.botUsername,
    botId: settings.botId,
    maskedToken: maskBotToken(settings.botToken),
    appUrl: settings.appUrl,
    webhookUrl: webhookUrlFor(settings.appUrl),
    connectedAt: settings.connectedAt,
    connectedBy: connectedBy ? { name: connectedBy.name, email: connectedBy.email } : null,
    linkedUsers,
    webhook,
    webhookError,
  };
}

export async function GET(req: NextRequest) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;
  const adminCheck = requireAdmin(authResult);
  if (adminCheck) return adminCheck;

  await connectDB();
  return NextResponse.json({ telegram: await describe(await getTelegramSettings()) });
}

/**
 * Connects (or reconnects) the bot: verifies the token with Telegram,
 * registers this app's webhook under a fresh secret and stores the result.
 * Omitting `botToken` re-registers the stored bot, e.g. after the App URL moves.
 */
export async function PUT(req: NextRequest) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;
  const adminCheck = requireAdmin(authResult);
  if (adminCheck) return adminCheck;

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    await connectDB();
    const existing = await getTelegramSettings();

    const rawToken = typeof body.botToken === "string" ? body.botToken.trim() : "";
    const token = rawToken || existing?.botToken || "";
    if (!token) throw new Error("Bot token is required");
    if (!isPlausibleBotToken(token)) {
      throw new Error("That doesn't look like a bot token. Copy it from @BotFather, e.g. 123456789:AA…");
    }
    const appUrl = normalizeAppUrl(body.appUrl);

    const bot = await getMe(token).catch((err) => {
      throw new Error(
        err instanceof TelegramApiError && err.errorCode === 401
          ? "Telegram rejected this bot token"
          : `Could not verify the bot: ${err instanceof Error ? err.message : err}`
      );
    });
    if (!bot.is_bot || !bot.username) throw new Error("This token does not belong to a bot");

    const webhookSecret = generateSecret();
    await setWebhook(token, webhookUrlFor(appUrl), webhookSecret).catch((err) => {
      throw new Error(`Telegram could not register the webhook: ${err instanceof Error ? err.message : err}`);
    });
    // The command menu is a nicety; don't fail the connection over it.
    await setMyCommands(token).catch(() => undefined);

    // Stop the previous bot from calling us if the admin switched bots.
    if (existing?.botToken && existing.botToken !== token) {
      await deleteWebhook(existing.botToken).catch(() => undefined);
    }

    const settings = (await TelegramSettings.findOneAndUpdate(
      { key: "default" },
      {
        $set: {
          botToken: token,
          botId: bot.id,
          botUsername: bot.username,
          webhookSecret,
          appUrl,
          connectedBy: authResult._id,
          connectedAt: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean()) as ITelegramSettings | null;

    return NextResponse.json({ telegram: await describe(settings) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to connect the Telegram bot";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** Disconnects the bot. Users stay linked and work again once a bot is reconnected. */
export async function DELETE(req: NextRequest) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;
  const adminCheck = requireAdmin(authResult);
  if (adminCheck) return adminCheck;

  await connectDB();
  const existing = await getTelegramSettings();
  if (existing?.botToken) await deleteWebhook(existing.botToken).catch(() => undefined);

  const settings = (await TelegramSettings.findOneAndUpdate(
    { key: "default" },
    {
      $set: {
        botToken: "",
        botId: null,
        botUsername: "",
        webhookSecret: "",
        connectedBy: null,
        connectedAt: null,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean()) as ITelegramSettings | null;

  return NextResponse.json({ telegram: await describe(settings) });
}
