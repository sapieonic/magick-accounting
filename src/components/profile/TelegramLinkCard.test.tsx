import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TelegramLinkCard from "./TelegramLinkCard";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
const toast = vi.fn();
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast }) }));

const unlinked = { available: true, botUsername: "magick_bot", botUrl: "https://t.me/magick_bot", link: null };
const linked = {
  ...unlinked,
  link: { username: "asha", firstName: "Asha", linkedAt: "2026-10-01T10:00:00.000Z" },
};

describe("TelegramLinkCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "open").mockImplementation(() => null);
  });

  it("tells members to ask an admin when no bot is connected", async () => {
    vi.mocked(api.get).mockResolvedValue({ available: false, botUsername: null, botUrl: null, link: null });
    render(<TelegramLinkCard isAdmin={false} />);
    expect(await screen.findByText(/Ask an admin to connect a bot/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Link Telegram/ })).not.toBeInTheDocument();
  });

  it("points admins to Settings when no bot is connected", async () => {
    vi.mocked(api.get).mockResolvedValue({ available: false, botUsername: null, botUrl: null, link: null });
    render(<TelegramLinkCard isAdmin />);
    expect(await screen.findByRole("link", { name: "Settings" })).toHaveAttribute("href", "/dashboard/admin/settings");
  });

  it("opens a one-time Telegram link and waits for the bot to confirm", async () => {
    vi.mocked(api.get).mockResolvedValue(unlinked);
    vi.mocked(api.post).mockResolvedValue({
      url: "https://t.me/magick_bot?start=abc",
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    });
    render(<TelegramLinkCard isAdmin={false} />);

    await userEvent.click(await screen.findByRole("button", { name: /Link Telegram/ }));

    expect(api.post).toHaveBeenCalledWith("/api/telegram/link");
    expect(window.open).toHaveBeenCalledWith("https://t.me/magick_bot?start=abc", "_blank", "noopener,noreferrer");
    expect(screen.getByText("Finish linking in Telegram")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open Telegram/ })).toHaveAttribute(
      "href",
      "https://t.me/magick_bot?start=abc"
    );
  });

  it("shows the linked account and unlinks after confirmation", async () => {
    vi.mocked(api.get).mockResolvedValue(linked);
    vi.mocked(api.delete).mockResolvedValue(unlinked);
    render(<TelegramLinkCard isAdmin={false} />);

    expect(await screen.findByText("Linked to @asha")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Unlink/ }));
    const dialogButtons = screen.getAllByRole("button", { name: "Unlink" });
    await userEvent.click(dialogButtons[dialogButtons.length - 1]);

    expect(api.delete).toHaveBeenCalledWith("/api/telegram/link");
    expect(await screen.findByRole("button", { name: /Link Telegram/ })).toBeInTheDocument();
    expect(toast).toHaveBeenCalledWith("Telegram unlinked");
  });
});
