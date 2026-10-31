import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  botDeepLink,
  claimTelegramUpdate,
  connectTelegramBot,
  describeTelegramSettings,
  generateLinkCode,
  hashLinkCode,
  matchWebhookSecret,
  normalizeAppUrl,
  secretMatches,
  UPDATE_RETRY_AFTER_MS,
  webhookUrlFor,
  type ConnectedBot,
} from "./telegram-server";
import {
  deleteWebhook,
  getMe,
  getWebhookInfo,
  isPlausibleBotToken,
  maskBotToken,
  setWebhook,
} from "./telegram";
import TelegramSettings from "@/models/TelegramSettings";
import TelegramUpdate from "@/models/TelegramUpdate";
import User from "@/models/User";

vi.mock("./telegram", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./telegram")>()),
  getMe: vi.fn(),
  setWebhook: vi.fn(),
  deleteWebhook: vi.fn(),
  getWebhookInfo: vi.fn(),
  setMyCommands: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/models/TelegramSettings", () => ({
  default: { findOne: vi.fn(), findOneAndUpdate: vi.fn(), updateOne: vi.fn() },
}));
vi.mock("@/models/TelegramUpdate", () => ({
  default: { create: vi.fn(), findOneAndUpdate: vi.fn(), updateOne: vi.fn() },
}));
vi.mock("@/models/User", () => ({ default: { countDocuments: vi.fn(), findById: vi.fn() } }));

const lean = (value: unknown) => ({ lean: vi.fn().mockResolvedValue(value) }) as never;
const OLD_TOKEN = "111111111:AAoldoldoldoldoldoldoldoldoldoldold";
const NEW_TOKEN = "222222222:AAnewnewnewnewnewnewnewnewnewnewnew";

describe("normalizeAppUrl", () => {
  it("keeps the https origin and any base path, without a trailing slash", () => {
    expect(normalizeAppUrl(" https://expenses.example.com/ ")).toBe("https://expenses.example.com");
    expect(normalizeAppUrl("https://example.com/accounts/")).toBe("https://example.com/accounts");
    expect(webhookUrlFor("https://example.com")).toBe("https://example.com/api/telegram/webhook");
  });

  it("rejects what Telegram can't deliver to", () => {
    expect(() => normalizeAppUrl("")).toThrow(/required/);
    expect(() => normalizeAppUrl("not a url")).toThrow(/valid URL/);
    expect(() => normalizeAppUrl("http://example.com")).toThrow(/https/);
    expect(() => normalizeAppUrl("https://localhost:3000")).toThrow(/localhost/);
  });
});

describe("link codes", () => {
  it("are valid Telegram start parameters and stored only as a hash", () => {
    const { code, hash } = generateLinkCode();
    expect(code).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    expect(hash).toBe(hashLinkCode(code));
    expect(hash).not.toContain(code);
    expect(generateLinkCode().code).not.toBe(code);
    expect(botDeepLink("magick_bot", code)).toBe(`https://t.me/magick_bot?start=${code}`);
  });
});

describe("secretMatches", () => {
  it("requires the exact secret", () => {
    expect(secretMatches("abc123", "abc123")).toBe(true);
    expect(secretMatches("abc123", "abc124")).toBe(false);
    expect(secretMatches("abc123", "abc")).toBe(false);
    expect(secretMatches("abc123", null)).toBe(false);
    expect(secretMatches("", "")).toBe(false);
  });
});

describe("bot tokens", () => {
  const token = "123456789:AAH4sJ_3kq9vXyZ-abcdefghijklmnopqrs";
  it("recognises BotFather tokens", () => {
    expect(isPlausibleBotToken(token)).toBe(true);
    expect(isPlausibleBotToken("hello")).toBe(false);
  });
  it("masks all but the bot id and the last 4 characters", () => {
    expect(maskBotToken(token)).toBe("123456789:••••pqrs");
  });
});

describe("matchWebhookSecret", () => {
  const bot = { webhookSecret: "new", previousWebhookSecret: "old" } as ConnectedBot;
  it("accepts the current and the previous secret, and tells them apart", () => {
    expect(matchWebhookSecret(bot, "new")).toBe("current");
    expect(matchWebhookSecret(bot, "old")).toBe("previous");
    expect(matchWebhookSecret(bot, "other")).toBeNull();
    expect(matchWebhookSecret({ ...bot, previousWebhookSecret: "" }, "")).toBeNull();
  });
});

describe("claimTelegramUpdate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("claims a new update", async () => {
    vi.mocked(TelegramUpdate.create).mockResolvedValue({} as never);
    await expect(claimTelegramUpdate(9, 100)).resolves.toBe(true);
    expect(TelegramUpdate.create).toHaveBeenCalledWith(
      expect.objectContaining({ botId: 9, updateId: 100, status: "processing" })
    );
  });

  it("skips a duplicate unless its earlier attempt stalled", async () => {
    vi.mocked(TelegramUpdate.create).mockRejectedValue(Object.assign(new Error("dup"), { code: 11000 }));
    vi.mocked(TelegramUpdate.findOneAndUpdate).mockResolvedValueOnce(null);
    await expect(claimTelegramUpdate(9, 100)).resolves.toBe(false);

    vi.mocked(TelegramUpdate.findOneAndUpdate).mockResolvedValueOnce({} as never);
    await expect(claimTelegramUpdate(9, 100)).resolves.toBe(true);
    const [filter] = vi.mocked(TelegramUpdate.findOneAndUpdate).mock.calls[1] as unknown as [
      { status: string; startedAt: { $lt: Date } },
    ];
    expect(filter.status).toBe("processing");
    expect(Date.now() - filter.startedAt.$lt.getTime()).toBeGreaterThanOrEqual(UPDATE_RETRY_AFTER_MS - 1000);
  });

  it("surfaces other database errors", async () => {
    vi.mocked(TelegramUpdate.create).mockRejectedValue(new Error("down"));
    await expect(claimTelegramUpdate(9, 100)).rejects.toThrow("down");
  });
});

describe("connectTelegramBot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getMe).mockResolvedValue({ id: 222222222, is_bot: true, first_name: "Bot", username: "new_bot" });
    vi.mocked(setWebhook).mockResolvedValue(true);
    vi.mocked(deleteWebhook).mockResolvedValue(true);
    vi.mocked(TelegramSettings.findOneAndUpdate).mockReturnValue(lean({ botToken: NEW_TOKEN }));
  });

  it("saves the new bot before registering its webhook, and retires the old bot", async () => {
    vi.mocked(TelegramSettings.findOne).mockReturnValue(
      lean({ botToken: OLD_TOKEN, webhookSecret: "old-secret", appUrl: "https://old.example.com" })
    );
    await connectTelegramBot(NEW_TOKEN, "https://app.example.com/", "admin-1");

    const [, update] = vi.mocked(TelegramSettings.findOneAndUpdate).mock.calls[0] as unknown as [
      unknown,
      { $set: Record<string, unknown> },
    ];
    expect(update.$set).toMatchObject({
      botToken: NEW_TOKEN,
      botId: 222222222,
      botUsername: "new_bot",
      appUrl: "https://app.example.com",
      // A different bot never calls with the old bot's secret.
      previousWebhookSecret: "",
      connectedBy: "admin-1",
    });
    expect(setWebhook).toHaveBeenCalledWith(
      NEW_TOKEN,
      "https://app.example.com/api/telegram/webhook",
      update.$set.webhookSecret
    );
    expect(vi.mocked(TelegramSettings.findOneAndUpdate).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(setWebhook).mock.invocationCallOrder[0]
    );
    expect(deleteWebhook).toHaveBeenCalledWith(OLD_TOKEN);
  });

  it("keeps the stored token and still accepts its old secret when reconnecting the same bot", async () => {
    vi.mocked(getMe).mockResolvedValue({ id: 111111111, is_bot: true, first_name: "Bot", username: "old_bot" });
    vi.mocked(TelegramSettings.findOne).mockReturnValue(lean({ botToken: OLD_TOKEN, webhookSecret: "old-secret" }));
    await connectTelegramBot(undefined, "https://moved.example.com", "admin-1");

    const [, update] = vi.mocked(TelegramSettings.findOneAndUpdate).mock.calls[0] as unknown as [
      unknown,
      { $set: Record<string, unknown> },
    ];
    expect(update.$set).toMatchObject({ botToken: OLD_TOKEN, previousWebhookSecret: "old-secret" });
    expect(update.$set.webhookSecret).not.toBe("old-secret");
    expect(deleteWebhook).not.toHaveBeenCalled();
  });

  it("restores the previous connection when Telegram refuses the webhook", async () => {
    vi.mocked(TelegramSettings.findOne).mockReturnValue(
      lean({ botToken: OLD_TOKEN, botId: 111111111, botUsername: "old_bot", webhookSecret: "old-secret", appUrl: "https://old.example.com" })
    );
    vi.mocked(setWebhook).mockRejectedValue(new Error("bad webhook: HTTPS url must be provided"));

    await expect(connectTelegramBot(NEW_TOKEN, "https://app.example.com", "admin-1")).rejects.toThrow(
      /could not register the webhook/
    );
    const [filter, restore] = vi.mocked(TelegramSettings.updateOne).mock.calls[0] as unknown as [
      Record<string, unknown>,
      { $set: Record<string, unknown> },
    ];
    expect(filter.webhookSecret).toEqual(expect.any(String));
    expect(restore.$set).toMatchObject({ botToken: OLD_TOKEN, webhookSecret: "old-secret", botUsername: "old_bot" });
    expect(deleteWebhook).not.toHaveBeenCalled();
  });

  it("rejects bad input before calling Telegram", async () => {
    vi.mocked(TelegramSettings.findOne).mockReturnValue(lean(null));
    await expect(connectTelegramBot("", "https://app.example.com", "a")).rejects.toThrow(/required/);
    await expect(connectTelegramBot("nope", "https://app.example.com", "a")).rejects.toThrow(/bot token/);
    await expect(connectTelegramBot(NEW_TOKEN, "http://app.example.com", "a")).rejects.toThrow(/https/);
    expect(getMe).not.toHaveBeenCalled();
  });
});

describe("describeTelegramSettings", () => {
  it("never includes the token or the webhook secret", async () => {
    vi.mocked(User.countDocuments).mockResolvedValue(3);
    vi.mocked(User.findById).mockReturnValue({ select: () => lean({ name: "Admin", email: "a@x.com" }) } as never);
    vi.mocked(getWebhookInfo).mockResolvedValue({ url: "https://app.example.com/api/telegram/webhook", pending_update_count: 0 });

    const view = await describeTelegramSettings({
      botToken: NEW_TOKEN,
      webhookSecret: "secret-value",
      previousWebhookSecret: "old-secret-value",
      botUsername: "new_bot",
      botId: 222222222,
      appUrl: "https://app.example.com",
      connectedBy: "admin-1",
    } as never);

    const json = JSON.stringify(view);
    expect(json).not.toContain(NEW_TOKEN);
    expect(json).not.toContain("secret-value");
    expect(view).toMatchObject({ configured: true, maskedToken: "222222222:••••wnew", linkedUsers: 3 });
  });
});
