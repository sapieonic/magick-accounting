import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import TelegramSettings, { type ITelegramSettings } from "@/models/TelegramSettings";
import TelegramUpdate from "@/models/TelegramUpdate";
import User from "@/models/User";
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

// Server-side helpers for the Telegram integration: the bot connection that
// admins manage, webhook bookkeeping, and the one-time codes users link with.

export const LINK_CODE_TTL_MS = 15 * 60 * 1000;
export const WEBHOOK_PATH = "/api/telegram/webhook";
/** A redelivered update still "processing" after this long is assumed to have crashed. */
export const UPDATE_RETRY_AFTER_MS = 90 * 1000;

export interface ConnectedBot {
  token: string;
  botId: number;
  botUsername: string;
  webhookSecret: string;
  /** Accepted alongside webhookSecret while Telegram switches to the new one. */
  previousWebhookSecret: string;
  appUrl: string;
}

export async function getTelegramSettings(): Promise<ITelegramSettings | null> {
  return (await TelegramSettings.findOne({ key: "default" }).lean()) as ITelegramSettings | null;
}

/** The connected bot, or null when no admin has set one up. */
export async function getConnectedBot(): Promise<ConnectedBot | null> {
  const settings = await getTelegramSettings();
  if (!settings?.botToken || !settings.webhookSecret || !settings.botUsername || !settings.botId) {
    return null;
  }
  return {
    token: settings.botToken,
    botId: settings.botId,
    botUsername: settings.botUsername,
    webhookSecret: settings.webhookSecret,
    previousWebhookSecret: settings.previousWebhookSecret ?? "",
    appUrl: settings.appUrl,
  };
}

/**
 * Validates the public origin the webhook is registered under. Telegram only
 * delivers webhooks over HTTPS, so plain http (and localhost) is rejected.
 */
export function normalizeAppUrl(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) throw new Error("App URL is required");
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("App URL must be a valid URL, e.g. https://expenses.example.com");
  }
  if (url.protocol !== "https:") {
    throw new Error("Telegram requires an https:// App URL that is reachable from the internet");
  }
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    throw new Error("Telegram can't reach localhost; use a public URL (e.g. a tunnel) instead");
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

export function webhookUrlFor(appUrl: string): string {
  return `${appUrl}${WEBHOOK_PATH}`;
}

export function generateSecret(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

/** Constant-time comparison of the webhook secret header. */
export function secretMatches(expected: string, received: string | null): boolean {
  if (!expected || !received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Which registered secret the webhook call carries, if any. */
export function matchWebhookSecret(
  bot: ConnectedBot,
  received: string | null
): "current" | "previous" | null {
  if (secretMatches(bot.webhookSecret, received)) return "current";
  if (secretMatches(bot.previousWebhookSecret, received)) return "previous";
  return null;
}

/** Telegram has switched to the new secret, so the old one is retired. */
export async function retirePreviousWebhookSecret(bot: ConnectedBot): Promise<void> {
  if (!bot.previousWebhookSecret) return;
  await TelegramSettings.updateOne(
    { key: "default", webhookSecret: bot.webhookSecret },
    { $set: { previousWebhookSecret: "" } }
  );
}

/** A one-time code for t.me/<bot>?start=<code>; only its hash is stored. */
export function generateLinkCode(): { code: string; hash: string } {
  // 18 bytes -> 24 base64url chars, within Telegram's 64-char [A-Za-z0-9_-] limit.
  const code = randomBytes(18).toString("base64url");
  return { code, hash: hashLinkCode(code) };
}

export function hashLinkCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export function botDeepLink(botUsername: string, code?: string): string {
  return `https://t.me/${botUsername}${code ? `?start=${code}` : ""}`;
}

// --- Webhook bookkeeping ---

/**
 * Claims an update for processing. Returns false when it was already handled,
 * or is being handled right now. A claim left "processing" for longer than
 * UPDATE_RETRY_AFTER_MS (the function was killed) is taken over by Telegram's
 * redelivery, so a crash doesn't silently drop the user's message.
 */
export async function claimTelegramUpdate(botId: number, updateId: number): Promise<boolean> {
  try {
    await TelegramUpdate.create({ botId, updateId, status: "processing", startedAt: new Date() });
    return true;
  } catch (err) {
    if ((err as { code?: number }).code !== 11000) throw err;
  }
  const takenOver = await TelegramUpdate.findOneAndUpdate(
    {
      botId,
      updateId,
      status: "processing",
      startedAt: { $lt: new Date(Date.now() - UPDATE_RETRY_AFTER_MS) },
    },
    { $set: { startedAt: new Date() } }
  );
  return !!takenOver;
}

export async function finishTelegramUpdate(botId: number, updateId: number): Promise<void> {
  await TelegramUpdate.updateOne({ botId, updateId }, { $set: { status: "done" } });
}

// --- Admin connection management ---

export async function describeTelegramSettings(settings: ITelegramSettings | null) {
  const linkedUsers = await User.countDocuments({ "telegram.userId": { $type: "number" } });
  if (!settings?.botToken) {
    return { configured: false as const, appUrl: settings?.appUrl ?? "", linkedUsers };
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

  const connectedBy = (settings.connectedBy
    ? await User.findById(settings.connectedBy).select("name email").lean()
    : null) as { name: string; email: string } | null;

  return {
    configured: true as const,
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

/**
 * Connects (or reconnects) the bot: verifies the token with Telegram, stores
 * it with a fresh webhook secret, then registers the webhook. The new settings
 * are saved before Telegram learns the new secret, and the previous secret
 * stays accepted, so no update is refused while the two switch over. Omitting
 * `rawToken` re-registers the stored bot, e.g. after the App URL moves.
 */
export async function connectTelegramBot(
  rawToken: unknown,
  rawAppUrl: unknown,
  adminId: string
): Promise<ITelegramSettings | null> {
  const existing = await getTelegramSettings();
  const typedToken = typeof rawToken === "string" ? rawToken.trim() : "";
  const token = typedToken || existing?.botToken || "";
  if (!token) throw new Error("Bot token is required");
  if (!isPlausibleBotToken(token)) {
    throw new Error("That doesn't look like a bot token. Copy it from @BotFather, e.g. 123456789:AA…");
  }
  const appUrl = normalizeAppUrl(rawAppUrl);

  const bot = await getMe(token).catch((err) => {
    throw new Error(
      err instanceof TelegramApiError && err.errorCode === 401
        ? "Telegram rejected this bot token"
        : `Could not verify the bot: ${err instanceof Error ? err.message : err}`
    );
  });
  if (!bot.is_bot || !bot.username) throw new Error("This token does not belong to a bot");

  const sameBot = existing?.botToken === token;
  const webhookSecret = generateSecret();
  const saved = (await TelegramSettings.findOneAndUpdate(
    { key: "default" },
    {
      $set: {
        botToken: token,
        botId: bot.id,
        botUsername: bot.username,
        webhookSecret,
        // Only the same bot can still be calling with its old secret.
        previousWebhookSecret: sameBot ? existing?.webhookSecret ?? "" : "",
        appUrl,
        connectedBy: adminId,
        connectedAt: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean()) as ITelegramSettings | null;

  try {
    await setWebhook(token, webhookUrlFor(appUrl), webhookSecret);
  } catch (err) {
    // Put the previous connection back so a failed reconnect changes nothing.
    await TelegramSettings.updateOne(
      { key: "default", webhookSecret },
      {
        $set: {
          botToken: existing?.botToken ?? "",
          botId: existing?.botId ?? null,
          botUsername: existing?.botUsername ?? "",
          webhookSecret: existing?.webhookSecret ?? "",
          previousWebhookSecret: existing?.previousWebhookSecret ?? "",
          appUrl: existing?.appUrl ?? "",
          connectedBy: existing?.connectedBy ?? null,
          connectedAt: existing?.connectedAt ?? null,
        },
      }
    );
    throw new Error(`Telegram could not register the webhook: ${err instanceof Error ? err.message : err}`);
  }

  // The command menu is a nicety; don't fail the connection over it.
  await setMyCommands(token).catch(() => undefined);
  // Stop the previous bot from calling us if the admin switched bots.
  if (existing?.botToken && !sameBot) await deleteWebhook(existing.botToken).catch(() => undefined);

  return saved;
}

/** Disconnects the bot. Users stay linked and work again once a bot is reconnected. */
export async function disconnectTelegramBot(): Promise<ITelegramSettings | null> {
  const existing = await getTelegramSettings();
  if (existing?.botToken) await deleteWebhook(existing.botToken).catch(() => undefined);

  return (await TelegramSettings.findOneAndUpdate(
    { key: "default" },
    {
      $set: {
        botToken: "",
        botId: null,
        botUsername: "",
        webhookSecret: "",
        previousWebhookSecret: "",
        connectedBy: null,
        connectedAt: null,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean()) as ITelegramSettings | null;
}
