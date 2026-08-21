import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import Header from "./Header";
import { useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

describe("Header", () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      user: { name: "Ada", email: "ada@magickvoice.com", role: "admin" },
      logout: vi.fn(),
    } as any);
  });

  it("renders the MagickVoice lockup at the top left", () => {
    render(
      <ThemeProvider>
        <Header onMenuClick={() => {}} />
      </ThemeProvider>
    );

    expect(screen.getByText("MagickVoice")).toBeInTheDocument();
    expect(screen.getByText("Accounting portal")).toBeInTheDocument();
  });
});
