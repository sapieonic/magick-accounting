import { describe, expect, it } from "vitest";
import {
  botDeepLink,
  generateLinkCode,
  hashLinkCode,
  normalizeAppUrl,
  secretMatches,
  webhookUrlFor,
} from "./telegram-server";
import { isPlausibleBotToken, maskBotToken } from "./telegram";

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
