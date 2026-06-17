import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CommandPalette, { OPEN_COMMAND_PALETTE_EVENT } from "@/components/ui/CommandPalette";

const push = vi.fn();
let isAdmin = false;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ isAdmin }),
}));

function openPalette() {
  fireEvent.keyDown(window, { key: "k", metaKey: true });
}

describe("CommandPalette", () => {
  beforeEach(() => {
    push.mockClear();
    isAdmin = false;
  });

  it("is hidden until Cmd+K is pressed", () => {
    render(<CommandPalette />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    openPalette();
    expect(screen.getByRole("dialog", { name: /command palette/i })).toBeInTheDocument();
  });

  it("opens via the custom open event", () => {
    render(<CommandPalette />);
    fireEvent(window, new Event(OPEN_COMMAND_PALETTE_EVENT));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("hides admin pages for non-admin users", () => {
    render(<CommandPalette />);
    openPalette();
    expect(screen.queryByText("Users")).not.toBeInTheDocument();
    expect(screen.getByText("Expenses")).toBeInTheDocument();
  });

  it("shows admin pages for admins", () => {
    isAdmin = true;
    render(<CommandPalette />);
    openPalette();
    expect(screen.getByText("Users")).toBeInTheDocument();
    expect(screen.getByText("Invoices")).toBeInTheDocument();
  });

  it("filters commands and offers an expense search for free text", async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);
    openPalette();

    await user.type(screen.getByLabelText("Search commands"), "uber");
    expect(screen.getByText('Search expenses for "uber"')).toBeInTheDocument();

    await user.keyboard("{Enter}");
    expect(push).toHaveBeenCalledWith("/dashboard/expenses?q=uber");
  });

  it("navigates to the selected command on Enter", async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);
    openPalette();

    await user.type(screen.getByLabelText("Search commands"), "depart");
    await user.keyboard("{Enter}");
    expect(push).toHaveBeenCalledWith("/dashboard/departments");
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);
    openPalette();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
