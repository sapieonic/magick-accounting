import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Header from "./Header";
import { usePathname } from "next/navigation";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { OPEN_COMMAND_PALETTE_EVENT } from "@/components/ui/CommandPalette";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

function renderHeader() {
  return render(
    <ThemeProvider>
      <Header />
    </ThemeProvider>
  );
}

describe("Header", () => {
  beforeEach(() => {
    vi.mocked(usePathname).mockReturnValue("/dashboard/trips/66c1884c0853f8a76a4da201");
  });

  it("shows the current page's section", () => {
    renderHeader();

    expect(screen.getByText("Workspace")).toBeInTheDocument();
    expect(screen.getByText("Trips")).toBeInTheDocument();
  });

  it("keeps the brand mark for small screens", () => {
    renderHeader();

    expect(screen.getByAltText("MagickVoice Accounting portal")).toBeInTheDocument();
  });

  it("gives the mobile logo link a 44px hit area", () => {
    renderHeader();

    expect(screen.getByRole("link", { name: "MagickVoice Accounting portal" })).toHaveClass("h-11", "w-11");
  });

  it("opens the command palette from the search trigger", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen);
    try {
      renderHeader();
      await user.click(screen.getByRole("button", { name: /search expenses, trips, people/i }));
      expect(onOpen).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen);
    }
  });

  it("links to the new expense form, except on that form", () => {
    const { unmount } = renderHeader();
    expect(screen.getByRole("link", { name: "New expense" })).toHaveAttribute("href", "/dashboard/expenses/new");
    unmount();

    vi.mocked(usePathname).mockReturnValue("/dashboard/expenses/new");
    renderHeader();
    expect(screen.queryByRole("link", { name: "New expense" })).not.toBeInTheDocument();
  });
});
