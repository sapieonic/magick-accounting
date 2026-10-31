import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { DELETE, GET, PUT } from "./route";
import { verifyAuth } from "@/lib/auth";
import { connectTelegramBot, describeTelegramSettings, disconnectTelegramBot } from "@/lib/telegram-server";

vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  verifyAuth: vi.fn(),
}));
vi.mock("@/lib/mongodb", () => ({ connectDB: vi.fn() }));
vi.mock("@/lib/telegram-server", () => ({
  connectTelegramBot: vi.fn(),
  describeTelegramSettings: vi.fn(),
  disconnectTelegramBot: vi.fn(),
  getTelegramSettings: vi.fn(),
}));

const signIn = (role: "user" | "admin" | "master_admin") =>
  vi.mocked(verifyAuth).mockResolvedValue({ _id: "u1", email: "a@x.com", name: "A", role });
const req = (method: string, body?: unknown) =>
  new NextRequest("https://app.example.com/api/telegram/settings", {
    method,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

describe("/api/telegram/settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(describeTelegramSettings).mockResolvedValue({ configured: false, appUrl: "", linkedUsers: 0 });
  });

  it("is admin-only", async () => {
    signIn("user");
    expect((await GET(req("GET"))).status).toBe(403);
    expect((await PUT(req("PUT", { botToken: "x" }))).status).toBe(403);
    expect((await DELETE(req("DELETE"))).status).toBe(403);
    expect(connectTelegramBot).not.toHaveBeenCalled();
    expect(disconnectTelegramBot).not.toHaveBeenCalled();
  });

  it("connects with the submitted token and URL as the signed-in admin", async () => {
    signIn("admin");
    vi.mocked(connectTelegramBot).mockResolvedValue({} as never);
    const response = await PUT(req("PUT", { botToken: "123:abc", appUrl: "https://app.example.com" }));
    expect(response.status).toBe(200);
    expect(connectTelegramBot).toHaveBeenCalledWith("123:abc", "https://app.example.com", "u1");
  });

  it("returns connection errors as 400 with the message", async () => {
    signIn("admin");
    vi.mocked(connectTelegramBot).mockRejectedValue(new Error("Telegram rejected this bot token"));
    const response = await PUT(req("PUT", { botToken: "123:abc", appUrl: "https://app.example.com" }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Telegram rejected this bot token" });
  });
});
