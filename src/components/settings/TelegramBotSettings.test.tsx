import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TelegramBotSettings, { describeWebhookProblem, type TelegramSettingsView } from "./TelegramBotSettings";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
const toast = vi.fn();
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast }) }));

const connected: TelegramSettingsView = {
  configured: true,
  appUrl: "https://app.example.com",
  linkedUsers: 2,
  botUsername: "magick_bot",
  maskedToken: "123456789:••••abcd",
  webhookUrl: "https://app.example.com/api/telegram/webhook",
  connectedAt: "2026-10-01T10:00:00.000Z",
  connectedBy: { name: "Admin", email: "admin@example.com" },
  webhook: {
    url: "https://app.example.com/api/telegram/webhook",
    pendingUpdateCount: 0,
    lastErrorMessage: null,
    lastErrorDate: null,
  },
  webhookError: null,
};

describe("describeWebhookProblem", () => {
  const withError = (minutesAgo: number, pending = 0) => ({
    ...connected,
    webhook: {
      ...connected.webhook!,
      pendingUpdateCount: pending,
      lastErrorMessage: "Connection timed out",
      lastErrorDate: new Date(Date.now() - minutesAgo * 60 * 1000).toISOString(),
    },
  });

  it("is quiet when delivery is healthy, or the last error is old and nothing is queued", () => {
    expect(describeWebhookProblem(connected)).toBeNull();
    expect(describeWebhookProblem(withError(24 * 60))).toBeNull();
  });

  it("flags recent errors, queued updates, a moved webhook and an unreachable Telegram", () => {
    expect(describeWebhookProblem(withError(5))).toContain("Connection timed out");
    expect(describeWebhookProblem(withError(24 * 60, 3))).toContain("Connection timed out");
    expect(
      describeWebhookProblem({ ...connected, webhook: { ...connected.webhook!, url: "https://old.example.com/x" } })
    ).toContain("different URL");
    expect(describeWebhookProblem({ ...connected, webhookError: "fetch failed" })).toContain("fetch failed");
  });
});

describe("TelegramBotSettings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("connects a bot with the token and this app's URL", async () => {
    vi.mocked(api.get).mockResolvedValue({ telegram: { configured: false, appUrl: "", linkedUsers: 0 } });
    vi.mocked(api.put).mockResolvedValue({ telegram: connected });
    render(<TelegramBotSettings />);

    const tokenInput = await screen.findByLabelText("Bot token");
    expect(tokenInput).toHaveAttribute("type", "password");
    expect(screen.getByLabelText("App URL")).toHaveValue(window.location.origin);
    await userEvent.type(tokenInput, "123456789:AAH4sJ_3kq9vXyZ-abcdefghijklmnopqrs");
    await userEvent.clear(screen.getByLabelText("App URL"));
    await userEvent.type(screen.getByLabelText("App URL"), "https://app.example.com");
    await userEvent.click(screen.getByRole("button", { name: "Connect bot" }));

    expect(api.put).toHaveBeenCalledWith("/api/telegram/settings", {
      appUrl: "https://app.example.com",
      botToken: "123456789:AAH4sJ_3kq9vXyZ-abcdefghijklmnopqrs",
    });
    expect(await screen.findByText("@magick_bot")).toBeInTheDocument();
    expect(screen.getByText("123456789:••••abcd")).toBeInTheDocument();
    expect(toast).toHaveBeenCalledWith("Connected to @magick_bot");
  });

  it("reconnects without resending the stored token", async () => {
    vi.mocked(api.get).mockResolvedValue({ telegram: connected });
    vi.mocked(api.put).mockResolvedValue({ telegram: connected });
    render(<TelegramBotSettings />);

    await userEvent.click(await screen.findByRole("button", { name: "Reconnect" }));
    await userEvent.click(screen.getByRole("button", { name: "Reconnect" }));

    expect(api.put).toHaveBeenCalledWith("/api/telegram/settings", { appUrl: "https://app.example.com" });
  });

  it("disconnects after confirmation", async () => {
    vi.mocked(api.get).mockResolvedValue({ telegram: connected });
    vi.mocked(api.delete).mockResolvedValue({ telegram: { configured: false, appUrl: "https://app.example.com", linkedUsers: 2 } });
    render(<TelegramBotSettings />);

    await userEvent.click(await screen.findByRole("button", { name: /Disconnect/ }));
    const buttons = screen.getAllByRole("button", { name: "Disconnect" });
    await userEvent.click(buttons[buttons.length - 1]);

    expect(api.delete).toHaveBeenCalledWith("/api/telegram/settings");
    expect(await screen.findByRole("button", { name: "Connect bot" })).toBeInTheDocument();
  });
});
