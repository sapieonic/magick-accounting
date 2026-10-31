import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { DELETE, GET, POST } from "./route";
import { verifyAuth } from "@/lib/auth";
import { getConnectedBot, hashLinkCode, LINK_CODE_TTL_MS } from "@/lib/telegram-server";
import { discardPendingDrafts } from "@/lib/telegram-bot";
import { sendMessage } from "@/lib/telegram";
import User from "@/models/User";

vi.mock("@/lib/auth", () => ({ verifyAuth: vi.fn() }));
vi.mock("@/lib/mongodb", () => ({ connectDB: vi.fn() }));
vi.mock("@/lib/telegram-server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/telegram-server")>()),
  getConnectedBot: vi.fn(),
}));
vi.mock("@/lib/telegram-bot", () => ({ discardPendingDrafts: vi.fn().mockResolvedValue(0) }));
vi.mock("@/lib/telegram", () => ({ sendMessage: vi.fn().mockResolvedValue({}) }));
vi.mock("@/models/User", () => ({ default: { findById: vi.fn(), updateOne: vi.fn(), findByIdAndUpdate: vi.fn() } }));

const BOT = {
  token: "t",
  botId: 1,
  botUsername: "magick_bot",
  webhookSecret: "s",
  previousWebhookSecret: "",
  appUrl: "https://app.example.com",
};
const chain = (value: unknown) => ({ select: () => ({ lean: vi.fn().mockResolvedValue(value) }) }) as never;
const req = (method: string) => new NextRequest("https://app.example.com/api/telegram/link", { method });

describe("/api/telegram/link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAuth).mockResolvedValue({ _id: "u1", email: "a@x.com", name: "A", role: "user" });
    vi.mocked(getConnectedBot).mockResolvedValue(BOT);
    vi.mocked(User.findById).mockReturnValue(chain({ telegram: null }));
  });

  it("reports whether a bot is available and the caller's link", async () => {
    vi.mocked(User.findById).mockReturnValue(
      chain({ telegram: { userId: 42, chatId: 42, username: "asha", linkedAt: "2026-10-01" } })
    );
    const body = await (await GET(req("GET"))).json();
    expect(body).toEqual({
      available: true,
      botUsername: "magick_bot",
      botUrl: "https://t.me/magick_bot",
      link: { username: "asha", firstName: null, linkedAt: "2026-10-01" },
    });
  });

  it("issues a one-time deep link and stores only the code's hash", async () => {
    const response = await POST(req("POST"));
    expect(response.status).toBe(201);
    const { url, expiresAt } = await response.json();
    const code = new URL(url).searchParams.get("start")!;
    expect(url).toBe(`https://t.me/magick_bot?start=${code}`);

    const [filter, update] = vi.mocked(User.updateOne).mock.calls[0] as unknown as [
      unknown,
      { $set: { telegramLinkCodeHash: string; telegramLinkCodeExpiresAt: Date } },
    ];
    expect(filter).toEqual({ _id: "u1" });
    expect(update.$set.telegramLinkCodeHash).toBe(hashLinkCode(code));
    expect(new Date(expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(LINK_CODE_TTL_MS);
  });

  it("refuses to issue a link while no bot is connected", async () => {
    vi.mocked(getConnectedBot).mockResolvedValue(null);
    expect((await POST(req("POST"))).status).toBe(409);
    expect(User.updateOne).not.toHaveBeenCalled();
  });

  it("unlinks, discards unfinished drafts and tells the Telegram chat", async () => {
    vi.mocked(User.findByIdAndUpdate).mockReturnValue(chain({ telegram: { chatId: 42 } }));
    const body = await (await DELETE(req("DELETE"))).json();

    expect(User.findByIdAndUpdate).toHaveBeenCalledWith("u1", {
      $set: { telegram: null, telegramLinkCodeHash: null, telegramLinkCodeExpiresAt: null },
    });
    expect(discardPendingDrafts).toHaveBeenCalledWith("u1", BOT);
    expect(sendMessage).toHaveBeenCalledWith("t", 42, expect.stringContaining("disconnected"));
    expect(body.link).toBeNull();
  });
});
