import { beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { createExpenseFromDraft, handleTelegramUpdate, parseCommand } from "./telegram-bot";
import { hashLinkCode, type ConnectedBot } from "./telegram-server";
import {
  answerCallbackQuery,
  downloadFile,
  editMessageText,
  sendMessage,
  type TelegramUpdate,
} from "./telegram";
import { uploadObject } from "./s3";
import { extractExpense } from "./receipt-extract";
import { encodeDraftAction } from "./telegram-draft";
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
  botUsername: "magick_bot",
  webhookSecret: "secret",
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
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(sendMessage).mockResolvedValue({ message_id: 11, chat: { id: 42, type: "private" }, date: 0 });
  vi.mocked(Category.findById).mockReturnValue(query({ name: "Travel" }));
  vi.mocked(Department.findById).mockReturnValue(query({ name: "Engineering" }));
  vi.mocked(Currency.findById).mockReturnValue(query({ _id: INR, code: "INR", rateToBase: 1 }));
  vi.mocked(Currency.findOne).mockReturnValue(query({ _id: INR, code: "INR", rateToBase: 1 }));
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
    expect(vi.mocked(sendMessage).mock.calls[0][2]).toContain("https://app.example.com/dashboard/profile");
  });

  it("links the account the one-time code was issued to", async () => {
    vi.mocked(User.findOne).mockReturnValue(query(ASHA));
    vi.mocked(User.exists).mockResolvedValue(null);
    vi.mocked(User.updateOne).mockResolvedValue({ matchedCount: 1 } as never);

    await handleTelegramUpdate(message({ text: "/start code123" }), BOT);

    expect(User.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ telegramLinkCodeHash: hashLinkCode("code123") })
    );
    const [filter, update] = vi.mocked(User.updateOne).mock.calls[0] as unknown as [
      Record<string, unknown>,
      { $set: Record<string, unknown> },
    ];
    expect(filter).toEqual({ _id: USER_ID, telegramLinkCodeHash: hashLinkCode("code123") });
    expect(update.$set).toMatchObject({
      telegram: { userId: 42, chatId: 42, username: "asha", firstName: "Asha" },
      telegramLinkCodeHash: null,
    });
    expect(vi.mocked(sendMessage).mock.calls[0][2]).toContain("Linked to <b>Asha</b>");
  });

  it("refuses to link a Telegram account that belongs to someone else", async () => {
    vi.mocked(User.findOne).mockReturnValue(query(ASHA));
    vi.mocked(User.exists).mockResolvedValue({ _id: new mongoose.Types.ObjectId() } as never);

    await handleTelegramUpdate(message({ text: "/start code123" }), BOT);

    expect(User.updateOne).not.toHaveBeenCalled();
    expect(vi.mocked(sendMessage).mock.calls[0][2]).toContain("already linked to another");
  });

  it("rejects an expired or unknown code", async () => {
    vi.mocked(User.findOne).mockReturnValue(query(null));
    await handleTelegramUpdate(message({ text: "/start stale" }), BOT);
    expect(vi.mocked(sendMessage).mock.calls[0][2]).toContain("expired");
  });

  it("ignores group chats", async () => {
    await handleTelegramUpdate(
      { update_id: 1, message: { message_id: 1, from: FROM, chat: { id: -5, type: "group" }, date: 0, text: "hi" } },
      BOT
    );
    expect(User.findOne).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

describe("receipts", () => {
  it("stores the largest photo under the user's prefix and drafts what the AI read", async () => {
    vi.mocked(User.findOne).mockReturnValue(query(ASHA));
    vi.mocked(downloadFile).mockResolvedValue(Buffer.from("jpeg"));
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
    vi.mocked(Expense.findOne).mockReturnValue(query({ department: ENG }));
    vi.mocked(Department.exists).mockResolvedValue({ _id: ENG } as never);
    vi.mocked(Category.findById).mockReturnValue(query(null));
    vi.mocked(Category.find).mockReturnValue(query([{ _id: TRAVEL, name: "Travel" }]));
    vi.mocked(TelegramDraft.create).mockImplementation(async (doc: unknown) => ({
      ...draftDoc(),
      ...(doc as object),
      _id: DRAFT_ID,
    }) as never);

    await handleTelegramUpdate(
      message({
        caption: "Airport drop",
        photo: [
          { file_id: "small", width: 90, height: 90 },
          { file_id: "large", width: 1280, height: 960 },
        ],
      }),
      BOT
    );

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
  });

  it("refuses file types the reader can't handle", async () => {
    vi.mocked(User.findOne).mockReturnValue(query(ASHA));
    await handleTelegramUpdate(
      message({ document: { file_id: "f", file_unique_id: "u", mime_type: "application/zip" } }),
      BOT
    );
    expect(downloadFile).not.toHaveBeenCalled();
    expect(vi.mocked(sendMessage).mock.calls[0][2]).toContain("PDF, JPEG, PNG or WebP");
  });

  it("fills a typed amount into the draft waiting for it", async () => {
    vi.mocked(User.findOne).mockReturnValue(query(ASHA));
    const draft = draftDoc({ amount: null, awaiting: "amount" });
    vi.mocked(TelegramDraft.findOne).mockReturnValue(query(draft));

    await handleTelegramUpdate(message({ text: "₹1,250" }), BOT);

    expect(draft.amount).toBe(1250);
    expect(draft.awaiting).toBeNull();
    expect(draft.save).toHaveBeenCalled();
    expect(extractExpense).not.toHaveBeenCalled();
  });
});

describe("saving", () => {
  it("creates the expense once and links to it", async () => {
    vi.mocked(User.findOne).mockReturnValue(query(ASHA));
    const draft = draftDoc();
    vi.mocked(TelegramDraft.findOne).mockResolvedValue(draft as never);
    vi.mocked(TelegramDraft.findOneAndUpdate).mockResolvedValue({ ...draft, status: "saved" } as never);
    vi.mocked(Category.exists).mockResolvedValue({ _id: TRAVEL } as never);
    vi.mocked(Department.exists).mockResolvedValue({ _id: ENG } as never);
    vi.mocked(Expense.exists).mockResolvedValue(null);
    const expenseId = new mongoose.Types.ObjectId();
    vi.mocked(Expense.create).mockResolvedValue({ _id: expenseId } as never);

    await handleTelegramUpdate(
      {
        update_id: 2,
        callback_query: {
          id: "cb",
          from: FROM,
          data: encodeDraftAction({ type: "save", draftId: String(DRAFT_ID) }),
          message: { message_id: 11, chat: { id: 42, type: "private" }, date: 0 },
        },
      },
      BOT
    );

    expect(TelegramDraft.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: DRAFT_ID, status: "pending" },
      expect.objectContaining({ $set: expect.objectContaining({ status: "saved" }) }),
      { new: true }
    );
    expect(Expense.create).toHaveBeenCalledWith(
      expect.objectContaining({ createdBy: USER_ID, amount: 450, paymentSource: "pocket", pocketAmount: 450 })
    );
    expect(answerCallbackQuery).toHaveBeenCalledWith(BOT.token, "cb", "Saved");
    const keyboard = vi.mocked(editMessageText).mock.calls[0][4];
    expect(keyboard?.[0][0].url).toBe(`https://app.example.com/dashboard/expenses/${expenseId}/edit`);
  });

  it("doesn't save twice when the button is tapped again", async () => {
    vi.mocked(User.findOne).mockReturnValue(query(ASHA));
    vi.mocked(TelegramDraft.findOne).mockResolvedValue(draftDoc() as never);
    vi.mocked(TelegramDraft.findOneAndUpdate).mockResolvedValue(null);

    await handleTelegramUpdate(
      {
        update_id: 3,
        callback_query: { id: "cb", from: FROM, data: encodeDraftAction({ type: "save", draftId: String(DRAFT_ID) }) },
      },
      BOT
    );

    expect(Expense.create).not.toHaveBeenCalled();
    expect(answerCallbackQuery).toHaveBeenCalledWith(BOT.token, "cb", "This expense was already saved.");
  });

  it("only lets the owner act on a draft", async () => {
    vi.mocked(User.findOne).mockReturnValue(query(ASHA));
    vi.mocked(TelegramDraft.findOne).mockResolvedValue(null);
    await handleTelegramUpdate(
      {
        update_id: 4,
        callback_query: { id: "cb", from: FROM, data: encodeDraftAction({ type: "discard", draftId: String(DRAFT_ID) }) },
      },
      BOT
    );
    expect(TelegramDraft.findOne).toHaveBeenCalledWith({ _id: String(DRAFT_ID), user: USER_ID });
    expect(TelegramDraft.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe("createExpenseFromDraft", () => {
  it("converts at the entry rate and books a company payment with no pocket share", async () => {
    vi.mocked(Category.exists).mockResolvedValue({ _id: TRAVEL } as never);
    vi.mocked(Department.exists).mockResolvedValue({ _id: ENG } as never);
    vi.mocked(Currency.findById).mockReturnValue(query({ _id: USD, code: "USD", rateToBase: 83.5 }));
    vi.mocked(Expense.exists).mockResolvedValue(null);
    vi.mocked(Expense.create).mockResolvedValue({ _id: new mongoose.Types.ObjectId() } as never);

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
    vi.mocked(Department.exists).mockResolvedValue({ _id: ENG } as never);
    await expect(createExpenseFromDraft(draftDoc() as never, USER_ID)).rejects.toThrow(/category/);
    expect(Expense.create).not.toHaveBeenCalled();
  });
});
