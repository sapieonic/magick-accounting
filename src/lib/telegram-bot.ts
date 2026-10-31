import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import User from "@/models/User";
import TelegramDraft, { type ITelegramDraft } from "@/models/TelegramDraft";
import Category from "@/models/Category";
import Department from "@/models/Department";
import Currency from "@/models/Currency";
import Expense from "@/models/Expense";
import { deleteObject, uploadObject } from "@/lib/s3";
import { roundMoney } from "@/lib/asset";
import { buildPaymentFields, normalizeGstAmount, normalizePaymentSplit } from "@/lib/expense";
import {
  extractExpense,
  isExtractableReceiptType,
  RECEIPT_MAX_SIZE,
  type ExtractedExpense,
} from "@/lib/receipt-extract";
import {
  answerCallbackQuery,
  callTelegram,
  downloadFile,
  editMessageText,
  escapeHtml,
  sendChatAction,
  sendMessage,
  TelegramApiError,
  type TelegramCallbackQuery,
  type TelegramMessage,
  type TelegramUpdate,
  type TelegramUser,
} from "@/lib/telegram";
import {
  draftStep,
  encodeLinkConfirm,
  LINK_CANCEL,
  parseAmountReply,
  parseDraftAction,
  parseLinkConfirm,
  renderDiscardedCard,
  renderDraftCard,
  renderSavedCard,
  type AmountReply,
  type DraftOption,
  type DraftSnapshot,
} from "@/lib/telegram-draft";
import { hashLinkCode, type ConnectedBot } from "@/lib/telegram-server";

// The Telegram bot: turns receipts, invoices and forwarded messages sent by a
// linked user into an expense draft, asks for anything missing via inline
// buttons, and saves it as an ordinary expense once confirmed.
//
// Telegram may deliver updates for one chat concurrently, so every change to a
// draft is a conditional update on `status: "pending"`: a tap that loses the
// race to Save/Discard changes nothing.

const MAX_TEXT_LENGTH = 4000;
/** A short non-number counts as a botched amount only this soon after the bot asked. */
const AMOUNT_REPLY_WINDOW_MS = 15 * 60 * 1000;
/** Pending drafts untouched this long are discarded (and their receipt deleted). */
export const STALE_DRAFT_MS = 7 * 24 * 60 * 60 * 1000;
/** Saved/discarded drafts are kept this long, then removed by the TTL index. */
const FINISHED_DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface LinkedUser {
  _id: mongoose.Types.ObjectId;
  name: string;
  email: string;
}

/** An error whose message is written for the person chatting with the bot. */
export class DraftSaveError extends Error {}

function finishedExpiry(): Date {
  return new Date(Date.now() + FINISHED_DRAFT_TTL_MS);
}

function isNotConfigured(err: unknown): boolean {
  return err instanceof Error && /not configured/i.test(err.message);
}

// --- Copy ---

const HELP_TEXT = [
  "Send me any of these and I'll turn it into an expense:",
  "• a 📷 <b>photo</b> of a receipt",
  "• an <b>invoice or receipt file</b> (PDF, JPEG, PNG or WebP)",
  "• a <b>forwarded message</b>, e.g. a payment confirmation or booking email",
  "",
  "Add a caption to a photo to give me more context. I'll read the details, ask for anything missing, and save it once you confirm.",
  "",
  "/cancel — discard the expense you're adding",
  "/unlink — disconnect this Telegram account",
].join("\n");

const NO_AMOUNT_TEXT =
  "I couldn't spot an amount in that. Send me a receipt photo or file, or a message like <code>Client lunch 1450</code>. /help shows everything I can do.";

function profileUrl(bot: ConnectedBot): string {
  return `${bot.appUrl}/dashboard/profile`;
}

function notLinkedText(bot: ConnectedBot): string {
  return [
    "👋 I add expenses to <b>Magick Accounting</b>.",
    "",
    `To get started, link your account: open <a href="${escapeHtml(profileUrl(bot))}">your profile</a> in the app and tap <b>Link Telegram</b>.`,
  ].join("\n");
}

// --- Entry point ---

/** Handles one webhook update. Never throws: failures are reported to the chat. */
export async function handleTelegramUpdate(update: TelegramUpdate, bot: ConnectedBot): Promise<void> {
  try {
    if (update.callback_query) await handleCallback(update.callback_query, bot);
    else if (update.message) await handleMessage(update.message, bot);
  } catch (err) {
    console.error("Telegram update failed:", err);
    if (update.callback_query) {
      await answerCallbackQuery(
        bot.token,
        update.callback_query.id,
        "Something went wrong. Please try again."
      ).catch(() => undefined);
    } else if (update.message) {
      await sendMessage(
        bot.token,
        update.message.chat.id,
        "⚠️ Something went wrong on our side. Please try again, or add the expense in the app."
      ).catch(() => undefined);
    }
  }
}

export function parseCommand(text: string): { name: string; arg: string } | null {
  const match = text.match(/^\/([a-z0-9_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/i);
  return match ? { name: match[1].toLowerCase(), arg: (match[2] ?? "").trim() } : null;
}

async function findLinkedUser(telegramUserId: number): Promise<LinkedUser | null> {
  return (await User.findOne({ "telegram.userId": telegramUserId })
    .select("_id name email")
    .lean()) as LinkedUser | null;
}

async function handleMessage(msg: TelegramMessage, bot: ConnectedBot): Promise<void> {
  // Only private chats: a group would expose receipts to everyone in it.
  if (msg.chat.type !== "private" || !msg.from || msg.from.is_bot) return;
  const chatId = msg.chat.id;
  const text = (msg.text ?? "").trim();
  const command = parseCommand(text);

  if (command?.name === "start" && command.arg) {
    await offerLink(command.arg, chatId, bot);
    return;
  }

  const user = await findLinkedUser(msg.from.id);
  if (!user) {
    await sendMessage(bot.token, chatId, notLinkedText(bot));
    return;
  }
  await discardStaleDrafts(user._id, bot);

  if (command) {
    if (command.name === "cancel") await cancelDrafts(user, chatId, bot);
    else if (command.name === "unlink") await unlinkFromChat(user, chatId, bot);
    else if (command.name === "start" || command.name === "help") {
      await sendMessage(bot.token, chatId, `Hi ${escapeHtml(user.name)}! ${HELP_TEXT}`);
    } else await sendMessage(bot.token, chatId, `I don't know that command.\n\n${HELP_TEXT}`);
    return;
  }

  if (msg.photo?.length || msg.document) {
    await handleReceipt(msg, user, bot);
    return;
  }

  if (text) {
    if (await handleAmountReply(msg, text, user, bot)) return;
    // Don't spend an AI call on chatter like "thanks!": an expense message
    // has a number in it, and forwarded messages are always worth a look.
    if (!msg.forward_origin && !/\d/.test(text)) {
      await sendMessage(bot.token, chatId, NO_AMOUNT_TEXT, undefined, msg.message_id);
      return;
    }
    await handleTextExpense(msg, text, user, bot);
    return;
  }

  await sendMessage(bot.token, chatId, HELP_TEXT);
}

// --- Account linking ---

/**
 * Asks before linking, showing whose app account the code belongs to, so a
 * link someone else sent can't quietly route this chat into their account.
 */
async function offerLink(code: string, chatId: number, bot: ConnectedBot): Promise<void> {
  const user = (await User.findOne({
    telegramLinkCodeHash: hashLinkCode(code),
    telegramLinkCodeExpiresAt: { $gt: new Date() },
  })
    .select("_id name email")
    .lean()) as LinkedUser | null;

  if (!user) {
    await sendMessage(bot.token, chatId, expiredLinkText(bot));
    return;
  }
  await sendMessage(
    bot.token,
    chatId,
    [
      `Link this Telegram account to <b>${escapeHtml(user.name)}</b> (${escapeHtml(user.email)}) in Magick Accounting?`,
      "",
      "Expenses you send here will be added to that account. Only continue if it's yours.",
    ].join("\n"),
    [[{ text: "✅ Yes, link it", callback_data: encodeLinkConfirm(code) }], [{ text: "Cancel", callback_data: LINK_CANCEL }]]
  );
}

function expiredLinkText(bot: ConnectedBot): string {
  return `This link has expired or was already used. Open <a href="${escapeHtml(profileUrl(bot))}">your profile</a> and tap <b>Link Telegram</b> again.`;
}

/** Links the tapping Telegram account to the code's user; returns the reply to show. */
async function linkAccount(code: string, from: TelegramUser, chatId: number, bot: ConnectedBot): Promise<string> {
  const hash = hashLinkCode(code);
  const user = (await User.findOne({
    telegramLinkCodeHash: hash,
    telegramLinkCodeExpiresAt: { $gt: new Date() },
  })
    .select("_id name email")
    .lean()) as LinkedUser | null;
  if (!user) return expiredLinkText(bot);

  const takenMessage =
    "This Telegram account is already linked to another Magick Accounting user. Send /unlink here first, then open the link from your profile again.";
  if (await User.exists({ "telegram.userId": from.id, _id: { $ne: user._id } })) return takenMessage;

  try {
    const result = await User.updateOne(
      { _id: user._id, telegramLinkCodeHash: hash },
      {
        $set: {
          telegram: {
            userId: from.id,
            chatId,
            username: from.username ?? "",
            firstName: from.first_name ?? "",
            linkedAt: new Date(),
          },
          telegramLinkCodeHash: null,
          telegramLinkCodeExpiresAt: null,
        },
      }
    );
    if (result.matchedCount === 0) return expiredLinkText(bot);
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return takenMessage;
    throw err;
  }

  return `✅ Linked to <b>${escapeHtml(user.name)}</b> (${escapeHtml(user.email)}).\n\n${HELP_TEXT}`;
}

async function unlinkFromChat(user: LinkedUser, chatId: number, bot: ConnectedBot): Promise<void> {
  await User.updateOne(
    { _id: user._id },
    { $set: { telegram: null, telegramLinkCodeHash: null, telegramLinkCodeExpiresAt: null } }
  );
  await discardPendingDrafts(user._id, bot);
  await sendMessage(
    bot.token,
    chatId,
    "🔌 This Telegram account is no longer linked to Magick Accounting. You can link it again from your profile."
  );
}

// --- Creating drafts ---

function newObjectKey(userId: string, ext: string): string {
  return `receipts/${userId}/${randomBytes(16).toString("hex")}.${ext}`;
}

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

const TOO_LARGE_TEXT = "That file is larger than 10MB. Please send a smaller copy.";

/** A failure whose message can be shown to the user as is. */
class ChatError extends Error {}

async function handleReceipt(msg: TelegramMessage, user: LinkedUser, bot: ConnectedBot): Promise<void> {
  const chatId = msg.chat.id;
  let fileId: string;
  let mime: string;
  let filename: string;
  let size: number | undefined;
  const stamp = new Date(msg.date * 1000).toISOString().slice(0, 10);

  if (msg.photo?.length) {
    // Telegram sends several sizes; the largest keeps small print legible.
    const photo = [...msg.photo].sort((a, b) => b.width * b.height - a.width * a.height)[0];
    fileId = photo.file_id;
    size = photo.file_size;
    mime = "image/jpeg";
    filename = `telegram-photo-${stamp}.jpg`;
  } else {
    const doc = msg.document!;
    mime = (doc.mime_type ?? "").toLowerCase();
    if (!isExtractableReceiptType(mime)) {
      await sendMessage(
        bot.token,
        chatId,
        "I can read receipts and invoices as <b>PDF, JPEG, PNG or WebP</b>. Please send one of those, or forward the message as text.",
        undefined,
        msg.message_id
      );
      return;
    }
    fileId = doc.file_id;
    size = doc.file_size;
    filename = doc.file_name?.trim() || `telegram-receipt-${stamp}.${EXTENSIONS[mime]}`;
  }

  if (size && size > RECEIPT_MAX_SIZE) {
    await sendMessage(bot.token, chatId, TOO_LARGE_TEXT, undefined, msg.message_id);
    return;
  }

  const status = await sendMessage(bot.token, chatId, "⏳ Reading your receipt…", undefined, msg.message_id);
  await sendChatAction(bot.token, chatId);

  // Set while the uploaded file isn't owned by a draft yet, so a failure can delete it.
  let orphanKey: string | null = null;
  try {
    const buffer = await downloadFile(bot.token, fileId).catch((err) => {
      // getFile refuses files over 20MB even when the message had no size.
      if (err instanceof TelegramApiError && /too big/i.test(err.message)) throw new ChatError(TOO_LARGE_TEXT);
      throw err;
    });
    if (buffer.length > RECEIPT_MAX_SIZE) throw new ChatError(TOO_LARGE_TEXT);

    const receiptKey = newObjectKey(String(user._id), EXTENSIONS[mime]);
    orphanKey = receiptKey;
    await uploadObject(receiptKey, buffer, mime);

    let extracted: ExtractedExpense | null = null;
    let notice: string | undefined;
    try {
      extracted = await extractExpense({ kind: "file", buffer, mime, note: msg.caption });
    } catch (err) {
      // Keep the receipt: the user can fill the details in by hand.
      console.error("Telegram receipt extraction failed:", err);
      notice = isNotConfigured(err)
        ? "Automatic reading isn't set up for your organization yet, so let's fill the details in."
        : "I couldn't read the details automatically, so let's fill them in.";
    }

    const draft = await createDraft({
      user,
      chatId,
      messageId: status.message_id,
      extracted,
      receiptKey,
      receiptFilename: filename,
      fallbackTitle: msg.caption?.trim().split("\n")[0] || filename.replace(/\.[^.]+$/, ""),
    });
    orphanKey = null;
    await renderDraft(draft, bot, { notice });
  } catch (err) {
    if (orphanKey) await deleteObject(orphanKey).catch(() => undefined);
    if (!(err instanceof ChatError)) console.error("Telegram receipt failed:", err);
    await editMessageText(
      bot.token,
      chatId,
      status.message_id,
      err instanceof ChatError
        ? err.message
        : "⚠️ I couldn't process that file. Please try again, or add the expense in the app."
    ).catch(() => undefined);
  }
}

async function handleTextExpense(
  msg: TelegramMessage,
  text: string,
  user: LinkedUser,
  bot: ConnectedBot
): Promise<void> {
  const chatId = msg.chat.id;
  const status = await sendMessage(bot.token, chatId, "⏳ Reading your message…", undefined, msg.message_id);
  await sendChatAction(bot.token, chatId);

  try {
    let extracted: ExtractedExpense;
    try {
      extracted = await extractExpense({ kind: "text", text: text.slice(0, MAX_TEXT_LENGTH) });
    } catch (err) {
      console.error("Telegram text extraction failed:", err);
      throw new ChatError(
        isNotConfigured(err)
          ? "Reading messages isn't set up for your organization yet. Send a receipt photo or file instead, or add the expense in the app."
          : "I couldn't read that message right now. Please try again in a moment, or add the expense in the app."
      );
    }

    if (extracted.amount == null && !extracted.title) {
      throw new ChatError(`I couldn't find an expense in that message.\n\n${HELP_TEXT}`);
    }

    const draft = await createDraft({
      user,
      chatId,
      messageId: status.message_id,
      extracted: { ...extracted, description: extracted.description || text.slice(0, 500) },
      receiptKey: null,
      receiptFilename: null,
      fallbackTitle: text.split("\n")[0].slice(0, 80),
    });
    await renderDraft(draft, bot);
  } catch (err) {
    if (!(err instanceof ChatError)) console.error("Telegram text expense failed:", err);
    await editMessageText(
      bot.token,
      chatId,
      status.message_id,
      err instanceof ChatError
        ? err.message
        : "⚠️ I couldn't process that message. Please try again, or add the expense in the app."
    ).catch(() => undefined);
  }
}

/** The department of the user's latest expense, or the only one there is. */
async function defaultDepartment(userId: mongoose.Types.ObjectId): Promise<mongoose.Types.ObjectId | null> {
  const last = (await Expense.findOne({ createdBy: userId })
    .sort({ createdAt: -1 })
    .select("department")
    .lean()) as { department?: mongoose.Types.ObjectId } | null;
  if (last?.department && (await Department.exists({ _id: last.department }))) return last.department;
  const departments = (await Department.find().select("_id").limit(2).lean()) as { _id: mongoose.Types.ObjectId }[];
  return departments.length === 1 ? departments[0]._id : null;
}

async function createDraft(input: {
  user: LinkedUser;
  chatId: number;
  messageId: number;
  extracted: ExtractedExpense | null;
  receiptKey: string | null;
  receiptFilename: string | null;
  fallbackTitle: string;
}): Promise<ITelegramDraft> {
  const { extracted } = input;
  const [baseCurrency, department] = await Promise.all([
    Currency.findOne({ isBase: true }).select("_id").lean() as Promise<{ _id: mongoose.Types.ObjectId } | null>,
    defaultDepartment(input.user._id),
  ]);
  const amount = extracted?.amount ?? null;

  return TelegramDraft.create({
    user: input.user._id,
    chatId: input.chatId,
    messageId: input.messageId,
    status: "pending",
    awaiting: amount == null ? "amount" : null,
    title: (extracted?.title || input.fallbackTitle || "Expense via Telegram").slice(0, 200),
    amount,
    gstAmount: extracted?.gstAmount ?? null,
    currency: extracted?.currency ?? baseCurrency?._id ?? null,
    category: extracted?.category ?? null,
    department,
    paymentSource: "pocket",
    date: extracted?.date ?? new Date().toISOString().slice(0, 10),
    description: extracted?.description ?? "",
    receiptKey: input.receiptKey,
    receiptFilename: input.receiptFilename,
  }) as Promise<ITelegramDraft>;
}

// --- Rendering ---

async function toSnapshot(draft: ITelegramDraft): Promise<DraftSnapshot> {
  const [category, department, currency] = (await Promise.all([
    draft.category ? Category.findById(draft.category).select("name").lean() : null,
    draft.department ? Department.findById(draft.department).select("name").lean() : null,
    draft.currency
      ? Currency.findById(draft.currency).select("code").lean()
      : Currency.findOne({ isBase: true }).select("code").lean(),
  ])) as [{ name: string } | null, { name: string } | null, { code: string } | null];

  return {
    id: String(draft._id),
    title: draft.title,
    amount: draft.amount,
    gstAmount: draft.gstAmount,
    currencyCode: currency?.code ?? "INR",
    date: draft.date,
    description: draft.description,
    // A category/department deleted since the draft was made counts as missing.
    categoryName: category?.name ?? null,
    departmentName: department?.name ?? null,
    paymentSource: draft.paymentSource,
    receiptFilename: draft.receiptFilename,
  };
}

async function listOptions(model: mongoose.Model<unknown>): Promise<DraftOption[]> {
  const rows = (await model.find().select("name").sort({ name: 1 }).lean()) as unknown as {
    _id: unknown;
    name: string;
  }[];
  return rows.map((row) => ({ id: String(row._id), name: row.name }));
}

/**
 * Shows the draft card. It is edited in place, or with `fresh` re-sent at the
 * bottom of the chat (after the user typed a reply) and the old card removed.
 */
async function renderDraft(
  draft: ITelegramDraft,
  bot: ConnectedBot,
  { notice, fresh = false }: { notice?: string; fresh?: boolean } = {}
): Promise<void> {
  const snapshot = await toSnapshot(draft);
  const step = draftStep(snapshot);
  const card = renderDraftCard(snapshot, {
    categories: step === "category" ? await listOptions(Category as mongoose.Model<unknown>) : [],
    departments: step === "department" ? await listOptions(Department as mongoose.Model<unknown>) : [],
  });
  const html = notice ? `${escapeHtml(notice)}\n\n${card.html}` : card.html;

  if (draft.messageId && !fresh) {
    await editMessageText(bot.token, draft.chatId, draft.messageId, html, card.keyboard);
    return;
  }
  if (draft.messageId) {
    await callTelegram(bot.token, "deleteMessage", {
      chat_id: draft.chatId,
      message_id: draft.messageId,
    }).catch(() => undefined);
  }
  const sent = await sendMessage(bot.token, draft.chatId, html, card.keyboard);
  await TelegramDraft.updateOne({ _id: draft._id }, { $set: { messageId: sent.message_id } });
}

// --- Typed amounts ---

/**
 * Applies a typed amount to the draft it answers: the card the user replied
 * to, or else the latest draft waiting for an amount. Returns false when the
 * text isn't meant for a draft and should be read as a new expense.
 */
async function handleAmountReply(
  msg: TelegramMessage,
  text: string,
  user: LinkedUser,
  bot: ConnectedBot
): Promise<boolean> {
  if (msg.forward_origin) return false;
  const reply = parseAmountReply(text);
  const repliedTo = msg.reply_to_message?.message_id;

  let draft = (repliedTo
    ? await TelegramDraft.findOne({ user: user._id, status: "pending", messageId: repliedTo })
    : null) as ITelegramDraft | null;
  const explicit = !!draft;
  if (!draft) {
    draft = (await TelegramDraft.findOne({ user: user._id, status: "pending", awaiting: "amount" }).sort({
      updatedAt: -1,
    })) as ITelegramDraft | null;
    // A short non-number right after the bot asked is a botched amount; later
    // on, or anything longer, it's a new expense ("Lunch 450").
    const recent = draft && draft.updatedAt.getTime() > Date.now() - AMOUNT_REPLY_WINDOW_MS;
    if (draft && !reply && !(recent && text.length <= 40)) draft = null;
  }
  if (!draft) return false;

  if (!reply) {
    await sendMessage(
      bot.token,
      msg.chat.id,
      explicit
        ? "To change the amount, reply to the expense with just the number, e.g. <code>1250.50</code>."
        : "Please reply with just the amount, e.g. <code>1250.50</code> — or /cancel to discard it.",
      undefined,
      msg.message_id
    );
    return true;
  }
  await setDraftAmount(draft, reply, msg.chat.id, bot);
  return true;
}

async function setDraftAmount(
  draft: ITelegramDraft,
  reply: AmountReply,
  chatId: number,
  bot: ConnectedBot
): Promise<void> {
  const $set: Record<string, unknown> = { amount: reply.amount, awaiting: null };
  if (draft.gstAmount != null && draft.gstAmount > reply.amount) $set.gstAmount = null;
  if (reply.currencyCode) {
    const currency = (await Currency.findOne({ code: reply.currencyCode, isActive: true })
      .select("_id")
      .lean()) as { _id: mongoose.Types.ObjectId } | null;
    if (!currency) {
      await sendMessage(
        bot.token,
        chatId,
        `${escapeHtml(reply.currencyCode)} isn't a currency in Magick Accounting yet. Reply with just the number, or ask an admin to add it in Settings.`
      );
      return;
    }
    $set.currency = currency._id;
  }

  const updated = (await TelegramDraft.findOneAndUpdate(
    { _id: draft._id, status: "pending" },
    { $set },
    { new: true }
  )) as ITelegramDraft | null;
  if (!updated) {
    await sendMessage(bot.token, chatId, "That expense was already saved or discarded.");
    return;
  }
  await renderDraft(updated, bot, { fresh: true });
}

// --- Button presses ---

async function handleCallback(cb: TelegramCallbackQuery, bot: ConnectedBot): Promise<void> {
  const chatId = cb.message?.chat.id ?? cb.from.id;
  const messageId = cb.message?.message_id;

  if (cb.data === LINK_CANCEL || parseLinkConfirm(cb.data)) {
    const html =
      cb.data === LINK_CANCEL
        ? "Not linked. You can open the link from your profile again any time."
        : await linkAccount(parseLinkConfirm(cb.data)!, cb.from, chatId, bot);
    await answerCallbackQuery(bot.token, cb.id);
    if (messageId) await editMessageText(bot.token, chatId, messageId, html);
    else await sendMessage(bot.token, chatId, html);
    return;
  }

  const action = parseDraftAction(cb.data);
  if (!action) {
    await answerCallbackQuery(bot.token, cb.id);
    return;
  }
  const user = await findLinkedUser(cb.from.id);
  if (!user) {
    await answerCallbackQuery(bot.token, cb.id, "Link your account from your profile first.");
    return;
  }
  const owned = { _id: action.draftId, user: user._id };
  const alreadyDone = "This expense was already saved or discarded.";

  if (action.type === "discard") {
    const discarded = await discardDraft(owned, bot, messageId);
    await answerCallbackQuery(bot.token, cb.id, discarded ? "Discarded" : alreadyDone);
    return;
  }
  if (action.type === "save") {
    await saveDraft(owned, user, bot, cb.id, messageId);
    return;
  }

  const draft = (await TelegramDraft.findOne({ ...owned, status: "pending" })) as ITelegramDraft | null;
  if (!draft) {
    await answerCallbackQuery(bot.token, cb.id, alreadyDone);
    return;
  }

  const $set: Record<string, unknown> = messageId ? { messageId } : {};
  // Extra conditions so a concurrent change to the same field isn't overwritten blindly.
  const guard: Record<string, unknown> = {};
  let note: string | undefined;
  switch (action.type) {
    case "category":
      if (await Category.exists({ _id: action.value })) $set.category = new mongoose.Types.ObjectId(action.value);
      else {
        $set.category = null;
        note = "That category no longer exists.";
      }
      break;
    case "department":
      if (await Department.exists({ _id: action.value })) {
        $set.department = new mongoose.Types.ObjectId(action.value);
      } else {
        $set.department = null;
        note = "That department no longer exists.";
      }
      break;
    case "changeCategory":
      $set.category = null;
      break;
    case "changeDepartment":
      $set.department = null;
      break;
    case "togglePayment":
      guard.paymentSource = draft.paymentSource;
      $set.paymentSource = draft.paymentSource === "company" ? "pocket" : "company";
      break;
  }

  const updated = (await TelegramDraft.findOneAndUpdate(
    { ...owned, status: "pending", ...guard },
    { $set },
    { new: true }
  )) as ITelegramDraft | null;
  if (!updated) {
    await answerCallbackQuery(bot.token, cb.id, alreadyDone);
    return;
  }
  await answerCallbackQuery(bot.token, cb.id, note);
  await renderDraft(updated, bot);
}

/**
 * Discards a pending draft (and deletes its uploaded receipt). Returns false
 * when it was already saved or discarded. Without a bot the card isn't edited.
 */
async function discardDraft(
  filter: Record<string, unknown>,
  bot: ConnectedBot | null,
  messageId?: number
): Promise<boolean> {
  const claimed = (await TelegramDraft.findOneAndUpdate(
    { ...filter, status: "pending" },
    { $set: { status: "discarded", awaiting: null, expiresAt: finishedExpiry() } },
    { new: true }
  )) as ITelegramDraft | null;
  if (!claimed) return false;
  if (claimed.receiptKey) {
    await deleteObject(claimed.receiptKey).catch((err) =>
      console.error("Could not delete discarded Telegram receipt:", err)
    );
  }
  const cardId = messageId ?? claimed.messageId;
  if (bot && cardId) {
    const card = renderDiscardedCard(await toSnapshot(claimed));
    await editMessageText(bot.token, claimed.chatId, cardId, card.html, card.keyboard).catch(() => undefined);
  }
  return true;
}

/** Discards every pending draft of a user, e.g. when they unlink. Returns how many. */
export async function discardPendingDrafts(
  userId: mongoose.Types.ObjectId | string,
  bot: ConnectedBot | null,
  olderThan?: Date
): Promise<number> {
  const drafts = (await TelegramDraft.find({
    user: userId,
    status: "pending",
    ...(olderThan ? { updatedAt: { $lt: olderThan } } : {}),
  })
    .select("_id")
    .lean()) as { _id: mongoose.Types.ObjectId }[];
  let discarded = 0;
  for (const draft of drafts) {
    if (await discardDraft({ _id: draft._id }, bot)) discarded += 1;
  }
  return discarded;
}

/** Abandoned drafts would otherwise keep their receipt in S3 forever. */
async function discardStaleDrafts(userId: mongoose.Types.ObjectId, bot: ConnectedBot): Promise<void> {
  await discardPendingDrafts(userId, bot, new Date(Date.now() - STALE_DRAFT_MS)).catch((err) =>
    console.error("Could not discard stale Telegram drafts:", err)
  );
}

async function cancelDrafts(user: LinkedUser, chatId: number, bot: ConnectedBot): Promise<void> {
  const count = await discardPendingDrafts(user._id, bot);
  await sendMessage(
    bot.token,
    chatId,
    count
      ? `Discarded ${count === 1 ? "the expense" : `${count} expenses`} you were adding.`
      : "There's nothing to cancel."
  );
}

async function saveDraft(
  owned: Record<string, unknown>,
  user: LinkedUser,
  bot: ConnectedBot,
  callbackId: string,
  messageId?: number
): Promise<void> {
  // Claim the draft first so a double tap can't create two expenses.
  const claimed = (await TelegramDraft.findOneAndUpdate(
    { ...owned, status: "pending" },
    { $set: { status: "saved", awaiting: null, ...(messageId ? { messageId } : {}) } },
    { new: true }
  )) as ITelegramDraft | null;
  if (!claimed) {
    await answerCallbackQuery(bot.token, callbackId, "This expense was already saved or discarded.");
    return;
  }

  let expenseId: mongoose.Types.ObjectId;
  try {
    expenseId = await createExpenseFromDraft(claimed, user._id);
  } catch (err) {
    if (!(err instanceof DraftSaveError)) console.error("Telegram expense save failed:", err);
    const reverted = (await TelegramDraft.findOneAndUpdate(
      { _id: claimed._id, status: "saved", expense: null },
      { $set: { status: "pending" } },
      { new: true }
    )) as ITelegramDraft | null;
    await answerCallbackQuery(
      bot.token,
      callbackId,
      err instanceof DraftSaveError ? err.message : "Couldn't save the expense. Please try again."
    );
    // Re-render so the card asks for whatever is now missing.
    if (reverted) await renderDraft(reverted, bot);
    return;
  }

  await TelegramDraft.updateOne(
    { _id: claimed._id },
    { $set: { expense: expenseId, expiresAt: finishedExpiry() } }
  );
  await answerCallbackQuery(bot.token, callbackId, "Saved");
  if (claimed.messageId) {
    const card = renderSavedCard(
      await toSnapshot(claimed),
      bot.appUrl ? `${bot.appUrl}/dashboard/expenses/${expenseId}/edit` : null
    );
    await editMessageText(bot.token, claimed.chatId, claimed.messageId, card.html, card.keyboard);
  }
}

/**
 * Creates the expense for a completed draft with the same rules as
 * POST /api/expenses: entry-time exchange rate, GST within the total, and the
 * pocket/company split built by buildPaymentFields. Throws DraftSaveError,
 * with a message for the user, when the draft can't be saved as it is.
 */
export async function createExpenseFromDraft(
  draft: ITelegramDraft,
  userId: mongoose.Types.ObjectId | string
): Promise<mongoose.Types.ObjectId> {
  const amount = draft.amount;
  if (amount == null || !Number.isFinite(amount) || amount < 0) {
    throw new DraftSaveError("Add the amount first");
  }
  const [category, department] = await Promise.all([
    draft.category ? Category.exists({ _id: draft.category }) : null,
    draft.department ? Department.exists({ _id: draft.department }) : null,
  ]);
  if (!category) throw new DraftSaveError("Pick a category first");
  if (!department) throw new DraftSaveError("Pick a department first");

  const date = new Date(draft.date);
  if (Number.isNaN(date.getTime())) throw new DraftSaveError("The expense date is invalid");

  // A currency deleted since the draft was made falls back to the base currency.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let currency: any = draft.currency ? await Currency.findById(draft.currency).lean() : null;
  if (!currency) currency = await Currency.findOne({ isBase: true }).lean();
  const rateToBase: number = currency?.rateToBase ?? 1;

  let gstAmount: number | null;
  let split: ReturnType<typeof normalizePaymentSplit>;
  try {
    gstAmount = normalizeGstAmount(draft.gstAmount, amount);
    split = normalizePaymentSplit(draft.paymentSource, undefined, amount);
  } catch (err) {
    throw new DraftSaveError(err instanceof Error ? err.message : "The amounts don't add up");
  }
  const amountInBaseCurrency = roundMoney(amount * rateToBase);

  if (draft.receiptKey && (await Expense.exists({ receiptKey: draft.receiptKey }))) {
    throw new DraftSaveError("This receipt is already attached to another expense");
  }

  const expense = await Expense.create({
    title: draft.title || "Expense via Telegram",
    amount,
    gstAmount,
    currency: currency?._id ?? null,
    amountInBaseCurrency,
    gstAmountInBaseCurrency: gstAmount != null ? roundMoney(gstAmount * rateToBase) : null,
    exchangeRateToBase: rateToBase,
    category: draft.category,
    department: draft.department,
    date,
    description: draft.description || "",
    ...buildPaymentFields(split, amountInBaseCurrency, rateToBase),
    receiptKey: draft.receiptKey || undefined,
    receiptFilename: draft.receiptKey ? draft.receiptFilename || undefined : undefined,
    trip: null,
    travelType: null,
    createdBy: userId,
  });
  return expense._id;
}
