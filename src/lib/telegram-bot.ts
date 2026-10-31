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
  type TelegramCallbackQuery,
  type TelegramMessage,
  type TelegramUpdate,
  type TelegramUser,
} from "@/lib/telegram";
import {
  draftStep,
  parseAmountReply,
  parseDraftAction,
  renderDiscardedCard,
  renderDraftCard,
  renderSavedCard,
  type DraftOption,
  type DraftSnapshot,
} from "@/lib/telegram-draft";
import { hashLinkCode, type ConnectedBot } from "@/lib/telegram-server";

// The Telegram bot: turns receipts, invoices and forwarded messages sent by a
// linked user into an expense draft, asks for anything missing via inline
// buttons, and saves it as an ordinary expense once confirmed.

const MAX_TEXT_LENGTH = 4000;

interface LinkedUser {
  _id: mongoose.Types.ObjectId;
  name: string;
  email: string;
}

type DraftDoc = mongoose.HydratedDocument<ITelegramDraft>;

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
  const chatId = update.message?.chat.id ?? update.callback_query?.message?.chat.id;
  try {
    if (update.callback_query) await handleCallback(update.callback_query, bot);
    else if (update.message) await handleMessage(update.message, bot);
  } catch (err) {
    console.error("Telegram update failed:", err);
    if (chatId) {
      await sendMessage(
        bot.token,
        chatId,
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
    await linkAccount(command.arg, msg.from, chatId, bot);
    return;
  }

  const user = await findLinkedUser(msg.from.id);
  if (!user) {
    await sendMessage(bot.token, chatId, notLinkedText(bot));
    return;
  }

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
    const awaiting = await TelegramDraft.findOne({
      user: user._id,
      status: "pending",
      awaiting: "amount",
    }).sort({ updatedAt: -1 });
    if (awaiting) {
      const amount = parseAmountReply(text);
      if (amount != null) {
        await setDraftAmount(awaiting, amount, bot);
        return;
      }
      // A short non-number is most likely a botched amount; anything longer
      // or forwarded is a new expense.
      if (!msg.forward_origin && text.length <= 40) {
        await sendMessage(
          bot.token,
          chatId,
          "Please reply with just the amount, e.g. <code>1250.50</code> — or /cancel to discard it.",
          undefined,
          msg.message_id
        );
        return;
      }
    }
    await handleTextExpense(msg, text, user, bot);
    return;
  }

  await sendMessage(bot.token, chatId, HELP_TEXT);
}

// --- Account linking ---

async function linkAccount(
  code: string,
  from: TelegramUser,
  chatId: number,
  bot: ConnectedBot
): Promise<void> {
  const hash = hashLinkCode(code);
  const user = (await User.findOne({
    telegramLinkCodeHash: hash,
    telegramLinkCodeExpiresAt: { $gt: new Date() },
  })
    .select("_id name email")
    .lean()) as LinkedUser | null;

  if (!user) {
    await sendMessage(
      bot.token,
      chatId,
      `This link has expired or was already used. Open <a href="${escapeHtml(profileUrl(bot))}">your profile</a> and tap <b>Link Telegram</b> again.`
    );
    return;
  }

  const takenMessage =
    "This Telegram account is already linked to another Magick Accounting user. Send /unlink here first, then open the link from your profile again.";
  const other = await User.exists({ "telegram.userId": from.id, _id: { $ne: user._id } });
  if (other) {
    await sendMessage(bot.token, chatId, takenMessage);
    return;
  }

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
    if (result.matchedCount === 0) {
      await sendMessage(bot.token, chatId, "This link was already used. Generate a new one from your profile.");
      return;
    }
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      await sendMessage(bot.token, chatId, takenMessage);
      return;
    }
    throw err;
  }

  await sendMessage(
    bot.token,
    chatId,
    `✅ Linked to <b>${escapeHtml(user.name)}</b> (${escapeHtml(user.email)}).\n\n${HELP_TEXT}`
  );
}

async function unlinkFromChat(user: LinkedUser, chatId: number, bot: ConnectedBot): Promise<void> {
  await User.updateOne({ _id: user._id }, { $set: { telegram: null } });
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

  const tooLarge = "That file is larger than 10MB. Please send a smaller copy.";
  if (size && size > RECEIPT_MAX_SIZE) {
    await sendMessage(bot.token, chatId, tooLarge, undefined, msg.message_id);
    return;
  }

  const status = await sendMessage(bot.token, chatId, "⏳ Reading your receipt…", undefined, msg.message_id);
  await sendChatAction(bot.token, chatId);

  const buffer = await downloadFile(bot.token, fileId);
  if (buffer.length > RECEIPT_MAX_SIZE) {
    await editMessageText(bot.token, chatId, status.message_id, tooLarge);
    return;
  }
  const receiptKey = newObjectKey(String(user._id), EXTENSIONS[mime]);
  await uploadObject(receiptKey, buffer, mime);

  let extracted: ExtractedExpense | null = null;
  try {
    extracted = await extractExpense({ kind: "file", buffer, mime, note: msg.caption });
  } catch (err) {
    // Still keep the receipt: the user can fill the details in by hand.
    console.error("Telegram receipt extraction failed:", err);
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
  await renderDraft(draft, bot, {
    notice: extracted ? undefined : "I couldn't read the details automatically, so let's fill them in.",
  });
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

  let extracted: ExtractedExpense;
  try {
    extracted = await extractExpense({ kind: "text", text: text.slice(0, MAX_TEXT_LENGTH) });
  } catch (err) {
    console.error("Telegram text extraction failed:", err);
    await editMessageText(
      bot.token,
      chatId,
      status.message_id,
      "I couldn't read that message right now. Please try again in a moment, or add the expense in the app."
    );
    return;
  }

  if (extracted.amount == null && !extracted.title) {
    await editMessageText(
      bot.token,
      chatId,
      status.message_id,
      `I couldn't find an expense in that message.\n\n${HELP_TEXT}`
    );
    return;
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
}): Promise<DraftDoc> {
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
  }) as Promise<DraftDoc>;
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
  draft: DraftDoc,
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
  draft.messageId = sent.message_id;
  await draft.save();
}

async function setDraftAmount(draft: DraftDoc, amount: number, bot: ConnectedBot): Promise<void> {
  draft.amount = amount;
  if (draft.gstAmount != null && draft.gstAmount > amount) draft.gstAmount = null;
  draft.awaiting = null;
  await draft.save();
  await renderDraft(draft, bot, { fresh: true });
}

// --- Button presses ---

async function handleCallback(cb: TelegramCallbackQuery, bot: ConnectedBot): Promise<void> {
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
  const draft = (await TelegramDraft.findOne({ _id: action.draftId, user: user._id })) as DraftDoc | null;
  if (!draft || draft.status !== "pending") {
    await answerCallbackQuery(bot.token, cb.id, "This expense was already saved or discarded.");
    return;
  }
  if (cb.message?.message_id) draft.messageId = cb.message.message_id;

  switch (action.type) {
    case "category":
      if (!(await Category.exists({ _id: action.value }))) {
        await answerCallbackQuery(bot.token, cb.id, "That category no longer exists.");
        draft.category = null;
        break;
      }
      draft.category = new mongoose.Types.ObjectId(action.value);
      await answerCallbackQuery(bot.token, cb.id);
      break;
    case "department":
      if (!(await Department.exists({ _id: action.value }))) {
        await answerCallbackQuery(bot.token, cb.id, "That department no longer exists.");
        draft.department = null;
        break;
      }
      draft.department = new mongoose.Types.ObjectId(action.value);
      await answerCallbackQuery(bot.token, cb.id);
      break;
    case "changeCategory":
      draft.category = null;
      await answerCallbackQuery(bot.token, cb.id);
      break;
    case "changeDepartment":
      draft.department = null;
      await answerCallbackQuery(bot.token, cb.id);
      break;
    case "togglePayment":
      draft.paymentSource = draft.paymentSource === "company" ? "pocket" : "company";
      await answerCallbackQuery(bot.token, cb.id);
      break;
    case "discard":
      await discardDraft(draft, bot);
      await answerCallbackQuery(bot.token, cb.id, "Discarded");
      return;
    case "save":
      await saveDraft(draft, user, bot, cb.id);
      return;
  }

  await draft.save();
  await renderDraft(draft, bot);
}

async function discardDraft(draft: DraftDoc, bot: ConnectedBot): Promise<void> {
  const claimed = await TelegramDraft.findOneAndUpdate(
    { _id: draft._id, status: "pending" },
    { $set: { status: "discarded", awaiting: null } },
    { new: true }
  );
  if (!claimed) return;
  if (claimed.receiptKey) {
    await deleteObject(claimed.receiptKey).catch((err) =>
      console.error("Could not delete discarded Telegram receipt:", err)
    );
  }
  if (draft.messageId) {
    const card = renderDiscardedCard(await toSnapshot(claimed));
    await editMessageText(bot.token, claimed.chatId, draft.messageId, card.html, card.keyboard).catch(
      () => undefined
    );
  }
}

async function cancelDrafts(user: LinkedUser, chatId: number, bot: ConnectedBot): Promise<void> {
  const drafts = (await TelegramDraft.find({ user: user._id, status: "pending" })) as DraftDoc[];
  for (const draft of drafts) await discardDraft(draft, bot);
  await sendMessage(
    bot.token,
    chatId,
    drafts.length
      ? `Discarded ${drafts.length === 1 ? "the expense" : `${drafts.length} expenses`} you were adding.`
      : "There's nothing to cancel."
  );
}

async function saveDraft(draft: DraftDoc, user: LinkedUser, bot: ConnectedBot, callbackId: string): Promise<void> {
  // Claim the draft first so a double tap can't create two expenses.
  const claimed = (await TelegramDraft.findOneAndUpdate(
    { _id: draft._id, status: "pending" },
    { $set: { status: "saved", awaiting: null, messageId: draft.messageId } },
    { new: true }
  )) as DraftDoc | null;
  if (!claimed) {
    await answerCallbackQuery(bot.token, callbackId, "This expense was already saved.");
    return;
  }

  let expenseId: mongoose.Types.ObjectId;
  try {
    expenseId = await createExpenseFromDraft(claimed, user._id);
  } catch (err) {
    await TelegramDraft.updateOne({ _id: claimed._id }, { $set: { status: "pending" } });
    const message = err instanceof Error ? err.message : "Could not save the expense";
    await answerCallbackQuery(bot.token, callbackId, message.slice(0, 190));
    return;
  }

  claimed.expense = expenseId;
  await claimed.save();
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
 * pocket/company split built by buildPaymentFields.
 */
export async function createExpenseFromDraft(
  draft: ITelegramDraft,
  userId: mongoose.Types.ObjectId | string
): Promise<mongoose.Types.ObjectId> {
  const amount = draft.amount;
  if (amount == null || !Number.isFinite(amount) || amount < 0) {
    throw new Error("Add the amount first");
  }
  const [category, department] = await Promise.all([
    draft.category ? Category.exists({ _id: draft.category }) : null,
    draft.department ? Department.exists({ _id: draft.department }) : null,
  ]);
  if (!category) throw new Error("Pick a category first");
  if (!department) throw new Error("Pick a department first");

  const date = new Date(draft.date);
  if (Number.isNaN(date.getTime())) throw new Error("The expense date is invalid");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let currency: any = draft.currency ? await Currency.findById(draft.currency).lean() : null;
  if (!currency) currency = await Currency.findOne({ isBase: true }).lean();
  const rateToBase: number = currency?.rateToBase ?? 1;

  const gstAmount = normalizeGstAmount(draft.gstAmount, amount);
  const split = normalizePaymentSplit(draft.paymentSource, undefined, amount);
  const amountInBaseCurrency = roundMoney(amount * rateToBase);

  if (draft.receiptKey && (await Expense.exists({ receiptKey: draft.receiptKey }))) {
    throw new Error("This receipt is already attached to another expense");
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
