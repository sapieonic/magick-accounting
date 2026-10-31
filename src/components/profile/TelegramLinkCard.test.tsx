import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
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
const pendingLink = (minutes = 15) => ({
  url: "https://t.me/magick_bot?start=abc",
  expiresAt: new Date(Date.now() + minutes * 60 * 1000).toISOString(),
});

describe("TelegramLinkCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
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

  it("issues a one-time link for the user to open, without a blockable popup", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    vi.mocked(api.get).mockResolvedValue(unlinked);
    vi.mocked(api.post).mockResolvedValue(pendingLink());
    render(<TelegramLinkCard isAdmin={false} />);

    await userEvent.click(await screen.findByRole("button", { name: /Link Telegram/ }));

    expect(api.post).toHaveBeenCalledWith("/api/telegram/link");
    expect(open).not.toHaveBeenCalled();
    expect(screen.getByText("Finish linking in Telegram")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open Telegram/ })).toHaveAttribute(
      "href",
      "https://t.me/magick_bot?start=abc"
    );
  });

  it("switches to the linked state once the bot confirms", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(api.get).mockResolvedValueOnce(unlinked).mockResolvedValueOnce(unlinked).mockResolvedValue(linked);
    vi.mocked(api.post).mockResolvedValue(pendingLink());
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<TelegramLinkCard isAdmin={false} />);

    await user.click(await screen.findByRole("button", { name: /Link Telegram/ }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000); // still unlinked
    });
    expect(screen.getByText("Finish linking in Telegram")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(await screen.findByText("Linked to @asha")).toBeInTheDocument();
    expect(screen.queryByText("Finish linking in Telegram")).not.toBeInTheDocument();
    expect(toast).toHaveBeenCalledWith("Telegram linked");
  });

  it("says so when the link expires before it was used", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(api.get).mockResolvedValue(unlinked);
    vi.mocked(api.post).mockResolvedValue(pendingLink(0.01));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<TelegramLinkCard isAdmin={false} />);

    await user.click(await screen.findByRole("button", { name: /Link Telegram/ }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(toast).toHaveBeenCalledWith("That link expired. Tap Link Telegram to get a new one.", "error");
    expect(screen.getByRole("button", { name: /Link Telegram/ })).toBeInTheDocument();
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

  it("still lets a linked user unlink while the bot is disconnected", async () => {
    vi.mocked(api.get).mockResolvedValue({ ...linked, available: false, botUsername: null, botUrl: null });
    render(<TelegramLinkCard isAdmin={false} />);

    expect(await screen.findByText(/bot is disconnected right now/)).toBeInTheDocument();
    expect(screen.getByText("Linked to @asha")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Unlink/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Open bot/ })).not.toBeInTheDocument();
  });
});
