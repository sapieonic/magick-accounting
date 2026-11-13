import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProfilePage from "./page";
import { useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";

vi.mock("@/contexts/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("@/hooks/useTitle", () => ({ useTitle: vi.fn() }));
vi.mock("@/components/profile/TelegramLinkCard", () => ({ default: () => <p>Telegram card</p> }));

describe("ProfilePage", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark");
    localStorage.clear();
    vi.mocked(useAuth).mockReturnValue({
      user: { _id: "u1", name: "Ada Lovelace", email: "ada@example.com", role: "admin" },
      isAdmin: true,
    } as never);
  });

  it("lists the account details, with the theme as one of them", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ProfilePage />
      </ThemeProvider>
    );

    const account = screen.getByRole("region", { name: "Account" });
    const terms = Array.from(account.querySelectorAll("dt")).map((dt) => dt.textContent);
    expect(terms).toEqual(["Name", "Email", "Role", "Sign-in", "Theme"]);
    expect(screen.queryByRole("region", { name: "Appearance" })).not.toBeInTheDocument();
    expect(screen.getByText("Saved on this device")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Dark" }));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(screen.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");
    document.documentElement.classList.remove("dark");
  });
});
