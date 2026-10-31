import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import {
  createExpenseFromDraft,
  DraftSaveError,
  discardPendingDrafts,
  handleTelegramUpdate,
  parseCommand,
  STALE_DRAFT_MS,
} from "./telegram-bot";
import { hashLinkCode, type ConnectedBot } from "./telegram-server";
import {
  answerCallbackQuery,
  callTelegram,
  downloadFile,
  editMessageText,
  sendMessage,
  TelegramApiError,
  type TelegramUpdate,
} from "./telegram";
import { deleteObject, uploadObject } from "./s3";
import { extractExpense } from "./receipt-extract";
import { encodeDraftAction, encodeLinkConfirm, LINK_CANCEL } from "./telegram-draft";
import User from "@/models/User";
import TelegramDraft from "@/models/TelegramDraft";
import Category from "@/models/Category";
import Department from "@/models/Department";
import Currency from "@/models/Currency";
import Expense from "@/models/Expense";

vi.mock("./telegram", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./telegram")>();
  return {
    ...actual,
    callTelegram: vi.fn().mockResolvedValue(true),
    sendMessage: vi.fn(),
    editMessageText: vi.fn().mockResolvedValue(undefined),
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
    sendChatAction: vi.fn().mockResolvedValue(undefined),
    downloadFile: vi.fn(),
  };
});
vi.mock("./s3", () => ({ uploadObject: vi.fn(), deleteObject: vi.fn().mockResolvedValue(undefined) }));
vi.mock("./receipt-extract", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./receipt-extract")>();
  return { ...actual, extractExpense: vi.fn() };
});
vi.mock("@/models/User", () => ({ default: { findOne: vi.fn(), exists: vi.fn(), updateOne: vi.fn() } }));
vi.mock("@/models/TelegramDraft", () => ({
  default: { findOne: vi.fn(), find: vi.fn(), create: vi.fn(), findOneAndUpdate: vi.fn(), updateOne: vi.fn() },
}));
vi.mock("@/models/Category", () => ({ default: { findById: vi.fn(), find: vi.fn(), exists: vi.fn() } }));
vi.mock("@/models/Department", () => ({ default: { findById: vi.fn(), find: vi.fn(), exists: vi.fn() } }));
vi.mock("@/models/Currency", () => ({ default: { findOne: vi.fn(), findById: vi.fn() } }));
vi.mock("@/models/Expense", () => ({ default: { findOne: vi.fn(), exists: vi.fn(), create: vi.fn() } }));

const BOT: ConnectedBot = {
  token: "123456789:token",
  botId: 123456789,
  botUsername: "magick_bot",
  webhookSecret: "secret",
  previousWebhookSecret: "",
  appUrl: "https://app.example.com",
};
const USER_ID = new mongoose.Types.ObjectId("66c1884c0853f8a76a4da201");
const DRAFT_ID = new mongoose.Types.ObjectId("66c1884c0853f8a76a4da501");
const TRAVEL = new mongoose.Types.ObjectId("66c1884c0853f8a76a4da301");
const ENG = new mongoose.Types.ObjectId("66c1884c0853f8a76a4da401");
const INR = new mongoose.Types.ObjectId("66c1884c0853f8a76a4da601");
const USD = new mongoose.Types.ObjectId("66c1884c0853f8a76a4da602");
const ASHA = { _id: USER_ID, name: "Asha", email: "asha@example.com" };
const FROM = { id: 42, is_bot: false, first_name: "Asha", username: "asha" };
const LONG_AGO = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

/** A thenable mongoose query stand-in. */
function query(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const method of ["select", "sort", "limit", "populate"]) q[method] = vi.fn(() => q);
  q.lean = vi.fn().mockResolvedValue(result);
  q.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return q as never;
}

function message(extra: Record<string, unknown>): TelegramUpdate {
  return {
    update_id: 1,
    message: { message_id: 10, from: FROM, chat: { id: 42, type: "private" }, date: 1793404800, ...extra },
  } as TelegramUpdate;
}

function callback(data: string, messageId = 11): TelegramUpdate {
  return {
    update_id: 2,
    callback_query: {
      id: "cb",
      from: FROM,
      data,
      message: { message_id: messageId, chat: { id: 42, type: "private" }, date: 0 },
    },
  };
}

const draftAction = (type: "save" | "discard" | "togglePayment") =>
  encodeDraftAction({ type, draftId: String(DRAFT_ID) });

function draftDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: DRAFT_ID,
    user: USER_ID,
    chatId: 42,
    messageId: 11,
    status: "pending",
    awaiting: null,
    title: "Uber",
    amount: 450,
    gstAmount: null,
    currency: INR,
    category: TRAVEL,
    department: ENG,
    paymentSource: "pocket",
    date: "2026-10-30",
    description: "",
    receiptKey: `receipts/${USER_ID}/abc.jpg`,
    receiptFilename: "telegram-photo.jpg",
    expense: null,
    updatedAt: new Date(),
    ...overrides,
  };
}

const sentTexts = () => vi.mocked(sendMessage).mock.calls.map((call) => call[2]);
const editedTexts = () => vi.mocked(editMessageText).mock.calls.map((call) => call[3]);

let consoleError: ReturnType<typeof vi.spyOn>;
let expectErrorsLogged = false;

beforeEach(() => {
  vi.clearAllMocks();
  expectErrorsLogged = false;
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.mocked(sendMessage).mockResolvedValue({ message_id: 11, chat: { id: 42, type: "private" }, date: 0 });
  vi.mocked(User.findOne).mockReturnValue(query(ASHA));
  vi.mocked(TelegramDraft.find).mockReturnValue(query([]));
  vi.mocked(TelegramDraft.findOne).mockReturnValue(query(null));
  vi.mocked(Category.findById).mockReturnValue(query({ name: "Travel" }));
  vi.mocked(Department.findById).mockReturnValue(query({ name: "Engineering" }));
  vi.mocked(Currency.findById).mockReturnValue(query({ _id: INR, code: "INR", rateToBase: 1 }));
  vi.mocked(Currency.findOne).mockReturnValue(query({ _id: INR, code: "INR", rateToBase: 1 }));
});

afterEach(() => {
  // handleTelegramUpdate swallows errors; make sure none were hidden.
  if (!expectErrorsLogged) expect(consoleError).not.toHaveBeenCalled();
  consoleError.mockRestore();
});

describe("parseCommand", () => {
  it("reads commands, bot mentions and the start payload", () => {
    expect(parseCommand("/start abc_DEF-1")).toEqual({ name: "start", arg: "abc_DEF-1" });
    expect(parseCommand("/help@magick_bot")).toEqual({ name: "help", arg: "" });
    expect(parseCommand("paid 450 for lunch")).toBeNull();
  });
});

describe("linking", () => {
  it("tells an unlinked sender how to link instead of reading their receipt", async () => {
    vi.mocked(User.findOne).mockReturnValue(query(null));
    await handleTelegramUpdate(message({ photo: [{ file_id: "f", width: 1, height: 1 }] }), BOT);

    expect(downloadFile).not.toHaveBeenCalled();
    expect(sentTexts()[0]).toContain("https://app.example.com/dashboard/profile");
  });

  it("asks which account it's linking to before linking", async () => {
    await handleTelegramUpdate(message({ text: "/start code123" }), BOT);

    expect(User.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ telegramLinkCodeHash: hashLinkCode("code123") })
    );
    expect(User.updateOne).not.toHaveBeenCalled();
    const [, , html, keyboard] = vi.mocked(sendMessage).mock.calls[0];
    expect(html).toContain("<b>Asha</b> (asha@example.com)");
    expect(keyboard?.[0][0].callback_data).toBe(encodeLinkConfirm("code123"));
    expect(keyboard?.[1][0].callback_data).toBe(LINK_CANCEL);
  });

  it("links the tapping Telegram account once confirmed", async () => {
    vi.mocked(User.exists).mockResolvedValue(null);
    vi.mocked(User.updateOne).mockResolvedValue({ matchedCount: 1 } as never);

    await handleTelegramUpdate(callback(encodeLinkConfirm("code123"), 30), BOT);

    const [filter, update] = vi.mocked(User.updateOne).mock.calls[0] as unknown as [
      Record<string, unknown>,
      { $set: Record<string, unknown> },
    ];
    expect(filter).toEqual({ _id: USER_ID, telegramLinkCodeHash: hashLinkCode("code123") });
    expect(update.$set).toMatchObject({
      telegram: { userId: 42, chatId: 42, username: "asha", firstName: "Asha" },
      telegramLinkCodeHash: null,
    });
    const [, , messageId, html] = vi.mocked(editMessageText).mock.calls[0];
    expect(messageId).toBe(30);
    expect(html).toContain("Linked to <b>Asha</b>");
    expect(answerCallbackQuery).toHaveBeenCalledWith(BOT.token, "cb");
  });

  it("refuses to link a Telegram account that belongs to someone else", async () => {
    vi.mocked(User.exists).mockResolvedValue({ _id: new mongoose.Types.ObjectId() } as never);
    await handleTelegramUpdate(callback(encodeLinkConfirm("code123")), BOT);

    expect(User.updateOne).not.toHaveBeenCalled();
    expect(editedTexts()[0]).toContain("already linked to another");
  });

  it("rejects an expired or already used code", async () => {
    vi.mocked(User.findOne).mockReturnValue(query(null));
    await handleTelegramUpdate(message({ text: "/start stale" }), BOT);
    expect(sentTexts()[0]).toContain("expired");

    vi.mocked(User.findOne).mockReturnValue(query(ASHA));
    vi.mocked(User.exists).mockResolvedValue(null);
    vi.mocked(User.updateOne).mockResolvedValue({ matchedCount: 0 } as never);
    await handleTelegramUpdate(callback(encodeLinkConfirm("used")), BOT);
    expect(editedTexts()[0]).toContain("expired or was already used");
  });

  it("does nothing when linking is cancelled", async () => {
    await handleTelegramUpdate(callback(LINK_CANCEL), BOT);
    expect(User.updateOne).not.toHaveBeenCalled();
    expect(editedTexts()[0]).toContain("Not linked");
  });

  it("ignores group chats", async () => {
    await handleTelegramUpdate(
      { update_id: 1, message: { message_id: 1, from: FROM, chat: { id: -5, type: "group" }, date: 0, text: "hi" } },
      BOT
    );
    expect(User.findOne).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("/unlink clears the link and discards unfinished drafts", async () => {
    vi.mocked(TelegramDraft.find).mockReturnValue(query([{ _id: DRAFT_ID }]));
    vi.mocked(TelegramDraft.findOneAndUpdate).mockResolvedValue(draftDoc({ status: "discarded" }) as never);

    await handleTelegramUpdate(message({ text: "/unlink" }), BOT);

    expect(User.updateOne).toHaveBeenCalledWith(
      { _id: USER_ID },
      { $set: { telegram: null, telegramLinkCodeHash: null, telegramLinkCodeExpiresAt: null } }
    );
    expect(deleteObject).toHaveBeenCalledWith(`receipts/${USER_ID}/abc.jpg`);
    expect(sentTexts().at(-1)).toContain("no longer linked");
  });
});

describe("receipts", () => {
  function receiptMocks() {
    vi.mocked(downloadFile).mockResolvedValue(Buffer.from("jpeg"));
    vi.mocked(uploadObject).mockResolvedValue(undefined);
    vi.mocked(Expense.findOne).mockReturnValue(query({ department: ENG }));
    vi.mocked(Department.exists).mockResolvedValue({ _id: ENG } as never);
    vi.mocked(Category.findById).mockReturnValue(query(null));
    vi.mocked(Category.find).mockReturnValue(query([{ _id: TRAVEL, name: "Travel" }]));
    vi.mocked(TelegramDraft.create).mockImplementation(async (doc: unknown) => ({
      ...draftDoc(),
      ...(doc as object),
      _id: DRAFT_ID,
    }) as never);
  }
  const photo = (extra: Record<string, unknown> = {}) =>
    message({
      photo: [
        { file_id: "small", width: 90, height: 90 },
        { file_id: "large", width: 1280, height: 960 },
      ],
      ...extra,
    });

  it("stores the largest photo under the user's prefix and drafts what the AI read", async () => {
    receiptMocks();
    vi.mocked(extractExpense).mockResolvedValue({
      title: "Uber",
      amount: 450,
      gstAmount: null,
      date: "2026-10-30",
      description: "Ride",
      currency: String(INR),
      category: null,
      travelType: "cab",
    });

    await handleTelegramUpdate(photo({ caption: "Airport drop" }), BOT);

    expect(downloadFile).toHaveBeenCalledWith(BOT.token, "large");
    const [key, , mime] = vi.mocked(uploadObject).mock.calls[0];
    expect(key).toMatch(new RegExp(`^receipts/${USER_ID}/[a-f0-9]{32}\\.jpg$`));
    expect(mime).toBe("image/jpeg");
    expect(extractExpense).toHaveBeenCalledWith(expect.objectContaining({ kind: "file", note: "Airport drop" }));
    expect(TelegramDraft.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 450, department: ENG, receiptKey: key, awaiting: null })
    );
    // The status message turns into the draft card, asking for the category.
    const [, , messageId, html, keyboard] = vi.mocked(editMessageText).mock.calls[0];
    expect(messageId).toBe(11);
    expect(html).toContain("Pick a <b>category</b>");
    expect(keyboard?.[0][0].text).toBe("Travel");
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it("keeps the receipt and asks for the details when AI reading isn't configured", async () => {
    expectErrorsLogged = true;
    receiptMocks();
    vi.mocked(extractExpense).mockRejectedValue(new Error("DATABRICKS_TOKEN is not configured"));

    await handleTelegramUpdate(photo(), BOT);

    expect(TelegramDraft.create).toHaveBeenCalledWith(expect.objectContaining({ amount: null, awaiting: "amount" }));
    expect(editedTexts()[0]).toContain("Automatic reading isn't set up");
    expect(editedTexts()[0]).toContain("Reply with the total amount");
  });

  it("replaces the status message and deletes the upload when saving the draft fails", async () => {
    expectErrorsLogged = true;
    receiptMocks();
    vi.mocked(extractExpense).mockResolvedValue({
      title: "Uber", amount: 450, gstAmount: null, date: "2026-10-30", description: "", currency: null, category: null, travelType: null,
    });
    vi.mocked(TelegramDraft.create).mockRejectedValue(new Error("db down"));

    await handleTelegramUpdate(photo(), BOT);

    const [key] = vi.mocked(uploadObject).mock.calls[0];
    expect(deleteObject).toHaveBeenCalledWith(key);
    expect(editedTexts()).toEqual([expect.stringContaining("couldn't process that file")]);
    // One clear error in the chat, not a second generic one.
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("explains a file Telegram won't hand over because it is too big", async () => {
    receiptMocks();
    vi.mocked(downloadFile).mockRejectedValue(new TelegramApiError("Bad Request: file is too big", 400));

    await handleTelegramUpdate(
      message({ document: { file_id: "f", file_unique_id: "u", mime_type: "application/pdf", file_name: "big.pdf" } }),
      BOT
    );

    expect(uploadObject).not.toHaveBeenCalled();
    expect(editedTexts()).toEqual([expect.stringContaining("larger than 10MB")]);
  });

  it("refuses file types the reader can't handle", async () => {
    await handleTelegramUpdate(
      message({ document: { file_id: "f", file_unique_id: "u", mime_type: "application/zip" } }),
      BOT
    );
    expect(downloadFile).not.toHaveBeenCalled();
    expect(sentTexts()[0]).toContain("PDF, JPEG, PNG or WebP");
  });

  it("discards the user's drafts that have sat untouched for a week", async () => {
    await handleTelegramUpdate(message({ text: "/help" }), BOT);
    const [filter] = vi.mocked(TelegramDraft.find).mock.calls[0] as unknown as [
      { user: unknown; status: string; updatedAt: { $lt: Date } },
    ];
    expect(filter).toMatchObject({ user: USER_ID, status: "pending" });
    expect(Date.now() - filter.updatedAt.$lt.getTime()).toBeGreaterThanOrEqual(STALE_DRAFT_MS - 1000);
  });
});

describe("text messages", () => {
  function awaitingDraft(overrides: Record<string, unknown> = {}) {
    const draft = draftDoc({ amount: null, awaiting: "amount", ...overrides });
    vi.mocked(TelegramDraft.findOne).mockImplementation(((filter: Record<string, unknown>) =>
      query(filter.awaiting === "amount" ? draft : null)) as never);
    return draft;
  }

  it("fills a typed amount into the draft waiting for it, even days later", async () => {
    awaitingDraft({ updatedAt: LONG_AGO });
    vi.mocked(TelegramDraft.findOneAndUpdate).mockResolvedValue(draftDoc({ amount: 1250 }) as never);

    await handleTelegramUpdate(message({ text: "₹1,250" }), BOT);

    expect(TelegramDraft.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: DRAFT_ID, status: "pending" },
      { $set: { amount: 1250, awaiting: null, currency: INR } },
      { new: true }
    );
    // The card moves to the bottom of the chat.
    expect(callTelegram).toHaveBeenCalledWith(BOT.token, "deleteMessage", { chat_id: 42, message_id: 11 });
    expect(TelegramDraft.updateOne).toHaveBeenCalledWith({ _id: DRAFT_ID }, { $set: { messageId: 11 } });
    expect(extractExpense).not.toHaveBeenCalled();
  });

  it("won't record an amount in a currency the app doesn't have", async () => {
    awaitingDraft();
    vi.mocked(Currency.findOne).mockReturnValue(query(null));

    await handleTelegramUpdate(message({ text: "$50" }), BOT);

    expect(TelegramDraft.findOneAndUpdate).not.toHaveBeenCalled();
    expect(sentTexts()[0]).toContain("USD isn't a currency");
  });

  it("nudges a short non-number right after the bot asked for the amount", async () => {
    awaitingDraft({ updatedAt: new Date() });
    await handleTelegramUpdate(message({ text: "the total" }), BOT);
    expect(sentTexts()[0]).toContain("reply with just the amount");
    expect(extractExpense).not.toHaveBeenCalled();
  });

  it("reads a later message as a new expense instead of nagging about an old draft", async () => {
    awaitingDraft({ updatedAt: LONG_AGO });
    vi.mocked(extractExpense).mockResolvedValue({
      title: "", amount: null, gstAmount: null, date: "2026-10-30", description: "", currency: null, category: null, travelType: null,
    });

    await handleTelegramUpdate(message({ text: "Lunch 450" }), BOT);

    expect(extractExpense).toHaveBeenCalledWith({ kind: "text", text: "Lunch 450" });
    expect(TelegramDraft.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("corrects the amount of the card the user replies to", async () => {
    const draft = draftDoc({ messageId: 77 });
    vi.mocked(TelegramDraft.findOne).mockImplementation(((filter: Record<string, unknown>) =>
      query(filter.messageId === 77 ? draft : null)) as never);
    vi.mocked(TelegramDraft.findOneAndUpdate).mockResolvedValue(draftDoc({ amount: 500, messageId: 77 }) as never);

    await handleTelegramUpdate(message({ text: "500", reply_to_message: { message_id: 77 } }), BOT);

    expect(TelegramDraft.findOne).toHaveBeenCalledWith({ user: USER_ID, status: "pending", messageId: 77 });
    expect(TelegramDraft.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: DRAFT_ID, status: "pending" },
      { $set: { amount: 500, awaiting: null } },
      { new: true }
    );
  });

  it("treats a forwarded amount as a new expense, not as the pending amount", async () => {
    awaitingDraft();
    vi.mocked(extractExpense).mockResolvedValue({
      title: "", amount: null, gstAmount: null, date: "2026-10-30", description: "", currency: null, category: null, travelType: null,
    });
    await handleTelegramUpdate(message({ text: "₹500", forward_origin: { type: "user" } }), BOT);
    expect(TelegramDraft.findOneAndUpdate).not.toHaveBeenCalled();
    expect(extractExpense).toHaveBeenCalled();
  });

  it("doesn't spend an AI call on chatter without a number", async () => {
    await handleTelegramUpdate(message({ text: "thanks!" }), BOT);
    expect(extractExpense).not.toHaveBeenCalled();
    expect(sentTexts()[0]).toContain("couldn't spot an amount");
  });

  it("explains when message reading isn't configured", async () => {
    expectErrorsLogged = true;
    vi.mocked(extractExpense).mockRejectedValue(new Error("DATABRICKS_TOKEN is not configured"));
    await handleTelegramUpdate(message({ text: "Paid 450 for lunch" }), BOT);
    expect(editedTexts()[0]).toContain("isn't set up for your organization");
  });
});

describe("buttons", () => {
  it("toggles who paid only if nobody changed it meanwhile", async () => {
    vi.mocked(TelegramDraft.findOne).mockReturnValue(query(draftDoc()));
    vi.mocked(TelegramDraft.findOneAndUpdate).mockResolvedValue(draftDoc({ paymentSource: "company" }) as never);

    await handleTelegramUpdate(callback(draftAction("togglePayment")), BOT);

    expect(TelegramDraft.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: String(DRAFT_ID), user: USER_ID, status: "pending", paymentSource: "pocket" },
      { $set: { messageId: 11, paymentSource: "company" } },
      { new: true }
    );
    expect(editedTexts()[0]).toContain("Paid by the company");
  });

  it("leaves a card alone when the draft was saved in the meantime", async () => {
    vi.mocked(TelegramDraft.findOne).mockReturnValue(query(draftDoc()));
    vi.mocked(TelegramDraft.findOneAndUpdate).mockResolvedValue(null);

    await handleTelegramUpdate(callback(draftAction("togglePayment")), BOT);

    expect(editMessageText).not.toHaveBeenCalled();
    expect(answerCallbackQuery).toHaveBeenCalledWith(BOT.token, "cb", "This expense was already saved or discarded.");
  });

  it("only lets the owner act on a draft", async () => {
    vi.mocked(TelegramDraft.findOneAndUpdate).mockResolvedValue(null);
    await handleTelegramUpdate(callback(draftAction("discard")), BOT);
    expect(TelegramDraft.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: String(DRAFT_ID), user: USER_ID, status: "pending" },
      expect.anything(),
      { new: true }
    );
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it("discards a draft, deletes its receipt and strikes through the card", async () => {
    vi.mocked(TelegramDraft.findOneAndUpdate).mockResolvedValue(draftDoc({ status: "discarded" }) as never);

    await handleTelegramUpdate(callback(draftAction("discard")), BOT);

    const [, update] = vi.mocked(TelegramDraft.findOneAndUpdate).mock.calls[0] as unknown as [
      unknown,
      { $set: { status: string; expiresAt: Date } },
    ];
    expect(update.$set.status).toBe("discarded");
    expect(update.$set.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(deleteObject).toHaveBeenCalledWith(`receipts/${USER_ID}/abc.jpg`);
    expect(editedTexts()[0]).toContain("discarded");
    expect(answerCallbackQuery).toHaveBeenCalledWith(BOT.token, "cb", "Discarded");
  });

  it("/cancel discards every unfinished draft", async () => {
    vi.mocked(TelegramDraft.find).mockImplementation(((filter: Record<string, unknown>) =>
      query(filter.updatedAt ? [] : [{ _id: DRAFT_ID }, { _id: new mongoose.Types.ObjectId() }])) as never);
    vi.mocked(TelegramDraft.findOneAndUpdate).mockResolvedValue(draftDoc({ status: "discarded" }) as never);

    await handleTelegramUpdate(message({ text: "/cancel" }), BOT);

    expect(TelegramDraft.findOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(sentTexts().at(-1)).toBe("Discarded 2 expenses you were adding.");
  });
});

describe("saving", () => {
  function saveMocks() {
    vi.mocked(TelegramDraft.findOneAndUpdate).mockResolvedValueOnce(draftDoc({ status: "saved" }) as never);
    vi.mocked(Category.exists).mockResolvedValue({ _id: TRAVEL } as never);
    vi.mocked(Department.exists).mockResolvedValue({ _id: ENG } as never);
    vi.mocked(Expense.exists).mockResolvedValue(null);
  }

  it("creates the expense once and links to it", async () => {
    saveMocks();
    const expenseId = new mongoose.Types.ObjectId();
    vi.mocked(Expense.create).mockResolvedValue({ _id: expenseId } as never);

    await handleTelegramUpdate(callback(draftAction("save")), BOT);

    expect(TelegramDraft.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: String(DRAFT_ID), user: USER_ID, status: "pending" },
      { $set: { status: "saved", awaiting: null, messageId: 11 } },
      { new: true }
    );
    expect(Expense.create).toHaveBeenCalledWith(
      expect.objectContaining({ createdBy: USER_ID, amount: 450, paymentSource: "pocket", pocketAmount: 450 })
    );
    expect(TelegramDraft.updateOne).toHaveBeenCalledWith(
      { _id: DRAFT_ID },
      { $set: { expense: expenseId, expiresAt: expect.any(Date) } }
    );
    expect(answerCallbackQuery).toHaveBeenCalledWith(BOT.token, "cb", "Saved");
    const keyboard = vi.mocked(editMessageText).mock.calls[0][4];
    expect(keyboard?.[0][0].url).toBe(`https://app.example.com/dashboard/expenses/${expenseId}/edit`);
  });

  it("doesn't save twice when the button is tapped again", async () => {
    vi.mocked(TelegramDraft.findOneAndUpdate).mockResolvedValue(null);
    await handleTelegramUpdate(callback(draftAction("save")), BOT);
    expect(Expense.create).not.toHaveBeenCalled();
    expect(answerCallbackQuery).toHaveBeenCalledWith(BOT.token, "cb", "This expense was already saved or discarded.");
  });

  it("puts the draft back and asks again when its category was deleted", async () => {
    saveMocks();
    vi.mocked(Category.exists).mockResolvedValue(null);
    vi.mocked(Category.findById).mockReturnValue(query(null));
    vi.mocked(Category.find).mockReturnValue(query([{ _id: TRAVEL, name: "Travel" }]));
    vi.mocked(TelegramDraft.findOneAndUpdate).mockResolvedValueOnce(draftDoc() as never);

    await handleTelegramUpdate(callback(draftAction("save")), BOT);

    expect(Expense.create).not.toHaveBeenCalled();
    expect(TelegramDraft.findOneAndUpdate).toHaveBeenLastCalledWith(
      { _id: DRAFT_ID, status: "saved", expense: null },
      { $set: { status: "pending" } },
      { new: true }
    );
    expect(answerCallbackQuery).toHaveBeenCalledWith(BOT.token, "cb", "Pick a category first");
    expect(editedTexts()[0]).toContain("Pick a <b>category</b>");
  });

  it("hides database errors behind a friendly message", async () => {
    expectErrorsLogged = true;
    saveMocks();
    vi.mocked(Expense.create).mockRejectedValue(new Error("E11000 duplicate key error collection: expenses"));
    vi.mocked(TelegramDraft.findOneAndUpdate).mockResolvedValueOnce(draftDoc() as never);

    await handleTelegramUpdate(callback(draftAction("save")), BOT);

    expect(answerCallbackQuery).toHaveBeenCalledWith(BOT.token, "cb", "Couldn't save the expense. Please try again.");
    expect(consoleError).toHaveBeenCalled();
  });
});

describe("discardPendingDrafts", () => {
  it("works without a bot (nothing to edit) and counts what it discarded", async () => {
    vi.mocked(TelegramDraft.find).mockReturnValue(query([{ _id: DRAFT_ID }]));
    vi.mocked(TelegramDraft.findOneAndUpdate).mockResolvedValue(draftDoc({ receiptKey: null }) as never);

    await expect(discardPendingDrafts(USER_ID, null)).resolves.toBe(1);
    expect(editMessageText).not.toHaveBeenCalled();
    expect(deleteObject).not.toHaveBeenCalled();
  });
});

describe("createExpenseFromDraft", () => {
  beforeEach(() => {
    vi.mocked(Category.exists).mockResolvedValue({ _id: TRAVEL } as never);
    vi.mocked(Department.exists).mockResolvedValue({ _id: ENG } as never);
    vi.mocked(Expense.exists).mockResolvedValue(null);
    vi.mocked(Expense.create).mockResolvedValue({ _id: new mongoose.Types.ObjectId() } as never);
  });

  it("converts at the entry rate and books a company payment with no pocket share", async () => {
    vi.mocked(Currency.findById).mockReturnValue(query({ _id: USD, code: "USD", rateToBase: 83.5 }));

    await createExpenseFromDraft(
      draftDoc({ currency: USD, amount: 10, gstAmount: 1.5, paymentSource: "company" }) as never,
      USER_ID
    );

    expect(Expense.create).toHaveBeenCalledWith(
      expect.objectContaining({
        currency: USD,
        amountInBaseCurrency: 835,
        gstAmountInBaseCurrency: 125.25,
        exchangeRateToBase: 83.5,
        paymentSource: "company",
        pocketAmount: 0,
        pocketAmountInBaseCurrency: 0,
        date: new Date("2026-10-30"),
      })
    );
  });

  it("requires a category and a department that still exist", async () => {
    vi.mocked(Category.exists).mockResolvedValue(null);
    await expect(createExpenseFromDraft(draftDoc() as never, USER_ID)).rejects.toThrow(DraftSaveError);
    expect(Expense.create).not.toHaveBeenCalled();
  });

  it("reports GST above the total as a user-facing error", async () => {
    await expect(createExpenseFromDraft(draftDoc({ gstAmount: 999 }) as never, USER_ID)).rejects.toThrow(
      new DraftSaveError("GST amount cannot exceed the total amount")
    );
  });

  it("refuses a receipt that's already attached elsewhere", async () => {
    vi.mocked(Expense.exists).mockResolvedValue({ _id: new mongoose.Types.ObjectId() } as never);
    await expect(createExpenseFromDraft(draftDoc() as never, USER_ID)).rejects.toThrow(/already attached/);
  });
});
