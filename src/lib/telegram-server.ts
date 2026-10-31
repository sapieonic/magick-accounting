import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import TelegramSettings, { type ITelegramSettings } from "@/models/TelegramSettings";

// Server-side helpers for the Telegram integration: the bot connection that
// admins manage, and the one-time codes users link their accounts with.

export const LINK_CODE_TTL_MS = 15 * 60 * 1000;
export const WEBHOOK_PATH = "/api/telegram/webhook";

export interface ConnectedBot {
  token: string;
  botUsername: string;
  webhookSecret: string;
  appUrl: string;
}

export async function getTelegramSettings(): Promise<ITelegramSettings | null> {
  return (await TelegramSettings.findOne({ key: "default" }).lean()) as ITelegramSettings | null;
}

/** The connected bot, or null when no admin has set one up. */
export async function getConnectedBot(): Promise<ConnectedBot | null> {
  const settings = await getTelegramSettings();
  if (!settings?.botToken || !settings.webhookSecret || !settings.botUsername) return null;
  return {
    token: settings.botToken,
    botUsername: settings.botUsername,
    webhookSecret: settings.webhookSecret,
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
