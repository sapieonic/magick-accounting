import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { connectDB } from "@/lib/mongodb";
import { getConnectedBot } from "@/lib/telegram-server";
import { handleTelegramUpdate } from "@/lib/telegram-bot";
import TelegramUpdate from "@/models/TelegramUpdate";

vi.mock("@/lib/mongodb", () => ({ connectDB: vi.fn() }));
vi.mock("@/lib/telegram-server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/telegram-server")>()),
  getConnectedBot: vi.fn(),
}));
vi.mock("@/lib/telegram-bot", () => ({ handleTelegramUpdate: vi.fn() }));
vi.mock("@/models/TelegramUpdate", () => ({ default: { create: vi.fn() } }));

const BOT = { token: "t", botUsername: "magick_bot", webhookSecret: "s3cret", appUrl: "https://app.example.com" };

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
    vi.mocked(TelegramUpdate.create).mockResolvedValue({} as never);
  });

  it("rejects calls without the registered secret", async () => {
    const response = await POST(request({ update_id: 1 }, "wrong"));
    expect(response.status).toBe(401);
    expect(handleTelegramUpdate).not.toHaveBeenCalled();
  });

  it("404s when no bot is connected", async () => {
    vi.mocked(getConnectedBot).mockResolvedValue(null);
    const response = await POST(request({ update_id: 1 }, "s3cret"));
    expect(response.status).toBe(404);
  });

  it("handles an update once", async () => {
    const update = { update_id: 7, message: { text: "hi" } };
    const first = await POST(request(update, "s3cret"));
    expect(first.status).toBe(200);
    expect(handleTelegramUpdate).toHaveBeenCalledWith(update, BOT);

    vi.mocked(TelegramUpdate.create).mockRejectedValue(Object.assign(new Error("dup"), { code: 11000 }));
    const retry = await POST(request(update, "s3cret"));
    expect(retry.status).toBe(200);
    expect(handleTelegramUpdate).toHaveBeenCalledTimes(1);
  });
});
