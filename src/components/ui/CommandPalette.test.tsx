import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CommandPalette, { OPEN_COMMAND_PALETTE_EVENT } from "@/components/ui/CommandPalette";
import Modal from "@/components/ui/Modal";

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

  it("is hidden until Cmd+K is pressed, and aria-modal only while open (the scroll lock keys off it)", () => {
    render(<CommandPalette />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.querySelector('[aria-modal="true"]')).toBeNull();

    openPalette();
    expect(screen.getByRole("dialog", { name: /command palette/i })).toHaveAttribute("aria-modal", "true");
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

  it("offers the trips page", async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);
    openPalette();
    expect(screen.getByText("Trips")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Search commands"), "trip");
    await user.keyboard("{Enter}");
    expect(push).toHaveBeenCalledWith("/dashboard/trips");
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);
    openPalette();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("focuses the search box and returns focus to the opener on close", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button>Search</button>
        <CommandPalette />
      </>
    );
    const opener = screen.getByRole("button", { name: "Search" });
    opener.focus();
    openPalette();
    expect(screen.getByLabelText("Search commands")).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(opener).toHaveFocus();
  });

  it("stacks above the nav drawer and closes alone on Escape", async () => {
    const user = userEvent.setup();
    const closeDrawer = vi.fn();
    render(
      <>
        <Modal isOpen onClose={closeDrawer} title="Navigation">
          <a href="/dashboard">Overview</a>
        </Modal>
        <CommandPalette />
      </>
    );
    openPalette();
    const palette = screen.getByRole("dialog", { name: /command palette/i });
    expect(palette.className).toMatch(/\bz-\[60\]/);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: /command palette/i })).not.toBeInTheDocument();
    expect(closeDrawer).not.toHaveBeenCalled();
  });

  it("is a combobox pointing at its active option, with no buttons nested in options", async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);
    openPalette();

    const input = screen.getByRole("combobox", { name: "Search commands" });
    const listbox = screen.getByRole("listbox", { name: "Commands" });
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute("aria-controls", listbox.id);
    expect(input).toHaveAttribute("aria-expanded", "true");

    const options = within(listbox).getAllByRole("option");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(input).toHaveAttribute("aria-activedescendant", options[0].id);
    expect(within(listbox).queryAllByRole("button")).toHaveLength(0);

    await user.keyboard("{ArrowDown}");
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    expect(input).toHaveAttribute("aria-activedescendant", options[1].id);
    expect(input).toHaveFocus();
  });

  it("runs an option on click", async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);
    openPalette();

    await user.click(screen.getByRole("option", { name: /Trips/ }));
    expect(push).toHaveBeenCalledWith("/dashboard/trips");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
