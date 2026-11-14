import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

describe("ConfirmDialog", () => {
  it("confirms and cancels", async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <ConfirmDialog isOpen title="Delete trip" confirmLabel="Delete trip" onConfirm={onConfirm} onClose={onClose}>
        Expenses are kept.
      </ConfirmDialog>
    );
    const dialog = screen.getByRole("dialog", { name: "Delete trip" });
    expect(dialog).toHaveTextContent("Expenses are kept.");
    await userEvent.click(screen.getByRole("button", { name: "Delete trip" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows progress and cannot be dismissed while busy", async () => {
    const onClose = vi.fn();
    render(
      <ConfirmDialog
        isOpen
        busy
        title="Unlink Telegram"
        confirmLabel="Unlink"
        busyLabel="Unlinking..."
        onConfirm={vi.fn()}
        onClose={onClose}
      >
        The bot will stop accepting expenses.
      </ConfirmDialog>
    );
    expect(screen.getByRole("button", { name: "Unlinking..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
  });
});
