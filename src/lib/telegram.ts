// Minimal Telegram Bot API client (https://core.telegram.org/bots/api).
// Server-only: every call needs the bot token.

const API_BASE = "https://api.telegram.org";

/** The largest file a bot may download through getFile. */
export const TELEGRAM_DOWNLOAD_LIMIT = 20 * 1024 * 1024;

export class TelegramApiError extends Error {
  constructor(
    message: string,
    readonly errorCode?: number
  ) {
    super(message);
  }
}

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
}

export interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface TelegramDocument {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
  document?: TelegramDocument;
  /** Present on forwarded messages. */
  forward_origin?: unknown;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export type InlineKeyboard = InlineKeyboardButton[][];

export interface TelegramWebhookInfo {
  url: string;
  pending_update_count: number;
  last_error_date?: number;
  last_error_message?: string;
}

export async function callTelegram<T>(
  token: string,
  method: string,
  payload: Record<string, unknown> = {}
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    throw new TelegramApiError(
      `Could not reach Telegram: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  const data = (await res.json().catch(() => null)) as
    | { ok: boolean; result?: T; description?: string; error_code?: number }
    | null;
  if (!data?.ok) {
    throw new TelegramApiError(
      data?.description || `Telegram ${method} failed (${res.status})`,
      data?.error_code ?? res.status
    );
  }
  return data.result as T;
}

export function getMe(token: string): Promise<TelegramUser> {
  return callTelegram<TelegramUser>(token, "getMe");
}

export function setWebhook(token: string, url: string, secretToken: string): Promise<boolean> {
  return callTelegram<boolean>(token, "setWebhook", {
    url,
    secret_token: secretToken,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
}

export function deleteWebhook(token: string): Promise<boolean> {
  return callTelegram<boolean>(token, "deleteWebhook", { drop_pending_updates: true });
}

export function getWebhookInfo(token: string): Promise<TelegramWebhookInfo> {
  return callTelegram<TelegramWebhookInfo>(token, "getWebhookInfo");
}

export function setMyCommands(token: string): Promise<boolean> {
  return callTelegram<boolean>(token, "setMyCommands", {
    commands: [
      { command: "help", description: "How to add an expense" },
      { command: "cancel", description: "Discard the expense you're adding" },
      { command: "unlink", description: "Disconnect this Telegram account" },
    ],
  });
}

export function sendMessage(
  token: string,
  chatId: number,
  html: string,
  keyboard?: InlineKeyboard,
  replyTo?: number
): Promise<TelegramMessage> {
  return callTelegram<TelegramMessage>(token, "sendMessage", {
    chat_id: chatId,
    text: html,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    ...(replyTo ? { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } } : {}),
  });
}

export async function editMessageText(
  token: string,
  chatId: number,
  messageId: number,
  html: string,
  keyboard?: InlineKeyboard
): Promise<void> {
  try {
    await callTelegram(token, "editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text: html,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: { inline_keyboard: keyboard ?? [] },
    });
  } catch (err) {
    // Re-rendering an unchanged draft is harmless.
    if (err instanceof TelegramApiError && /message is not modified/i.test(err.message)) return;
    throw err;
  }
}

export async function answerCallbackQuery(token: string, id: string, text?: string): Promise<void> {
  await callTelegram(token, "answerCallbackQuery", { callback_query_id: id, ...(text ? { text } : {}) });
}

export async function sendChatAction(token: string, chatId: number, action = "typing"): Promise<void> {
  await callTelegram(token, "sendChatAction", { chat_id: chatId, action }).catch(() => undefined);
}

/** Downloads a file the user sent to the bot. */
export async function downloadFile(token: string, fileId: string): Promise<Buffer> {
  const file = await callTelegram<{ file_path?: string; file_size?: number }>(token, "getFile", {
    file_id: fileId,
  });
  if (!file.file_path) throw new TelegramApiError("Telegram did not return a file path");
  const res = await fetch(`${API_BASE}/file/bot${token}/${file.file_path}`);
  if (!res.ok) throw new TelegramApiError(`Could not download the file (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

/** Escapes text for Telegram's HTML parse mode. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** A bot token as shown by @BotFather: "<bot id>:<secret>". */
export function isPlausibleBotToken(token: string): boolean {
  return /^\d{5,}:[A-Za-z0-9_-]{30,}$/.test(token);
}

/** Masks a bot token for display, keeping the bot id and the last 4 characters. */
export function maskBotToken(token: string): string {
  if (!token) return "";
  const [id] = token.split(":");
  return `${id}:••••${token.slice(-4)}`;
}
