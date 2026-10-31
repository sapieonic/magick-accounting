import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { connectDB } from "@/lib/mongodb";
import {
  claimTelegramUpdate,
  finishTelegramUpdate,
  getConnectedBot,
  retirePreviousWebhookSecret,
} from "@/lib/telegram-server";
import { handleTelegramUpdate } from "@/lib/telegram-bot";

vi.mock("@/lib/mongodb", () => ({ connectDB: vi.fn() }));
vi.mock("@/lib/telegram-server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/telegram-server")>()),
  getConnectedBot: vi.fn(),
  claimTelegramUpdate: vi.fn(),
  finishTelegramUpdate: vi.fn(),
  retirePreviousWebhookSecret: vi.fn(),
}));
vi.mock("@/lib/telegram-bot", () => ({ handleTelegramUpdate: vi.fn() }));

const BOT = {
  token: "t",
  botId: 77,
  botUsername: "magick_bot",
  webhookSecret: "s3cret",
  previousWebhookSecret: "old-s3cret",
  appUrl: "https://app.example.com",
};

function request(body: unknown, secret?: string) {
  return new NextRequest("https://app.example.com/api/telegram/webhook", {
    method: "POST",
    headers: secret ? { "x-telegram-bot-api-secret-token": secret } : {},
    body: JSON.stringify(body),
  });
}

describe("POST /api/telegram/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(connectDB).mockResolvedValue(undefined as never);
    vi.mocked(getConnectedBot).mockResolvedValue(BOT);
    vi.mocked(claimTelegramUpdate).mockResolvedValue(true);
  });

  it("rejects calls without a registered secret", async () => {
    expect((await POST(request({ update_id: 1 }, "wrong"))).status).toBe(401);
    expect((await POST(request({ update_id: 1 }))).status).toBe(401);
    expect(handleTelegramUpdate).not.toHaveBeenCalled();
  });

  it("404s when no bot is connected", async () => {
    vi.mocked(getConnectedBot).mockResolvedValue(null);
    expect((await POST(request({ update_id: 1 }, "s3cret"))).status).toBe(404);
  });

  it("handles a claimed update and marks it done", async () => {
    const update = { update_id: 7, message: { text: "hi" } };
    const response = await POST(request(update, "s3cret"));
    expect(response.status).toBe(200);
    expect(claimTelegramUpdate).toHaveBeenCalledWith(77, 7);
    expect(handleTelegramUpdate).toHaveBeenCalledWith(update, BOT);
    expect(finishTelegramUpdate).toHaveBeenCalledWith(77, 7);
    // Telegram is on the new secret, so the old one can go.
    expect(retirePreviousWebhookSecret).toHaveBeenCalledWith(BOT);
  });

  it("acknowledges but skips an update that's already handled", async () => {
    vi.mocked(claimTelegramUpdate).mockResolvedValue(false);
    expect((await POST(request({ update_id: 7 }, "s3cret"))).status).toBe(200);
    expect(handleTelegramUpdate).not.toHaveBeenCalled();
  });

  it("still accepts the previous secret right after a reconnect", async () => {
    expect((await POST(request({ update_id: 8 }, "old-s3cret"))).status).toBe(200);
    expect(handleTelegramUpdate).toHaveBeenCalled();
    expect(retirePreviousWebhookSecret).not.toHaveBeenCalled();
  });

  it("ignores bodies that aren't updates", async () => {
    expect((await POST(request({ hello: "world" }, "s3cret"))).status).toBe(200);
    expect(claimTelegramUpdate).not.toHaveBeenCalled();
  });
});
