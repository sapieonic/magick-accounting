import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import RejectDialog, { toggleReason } from "./RejectDialog";
import type { ExpenseListItem } from "@/types/expense";

const INR = { _id: "inr", code: "INR", name: "Indian Rupee", symbol: "₹", isBase: true };

function expense(id: string, title: string, amount: number, submitter = "Asha Rao"): ExpenseListItem {
  return {
    _id: id,
    title,
    amount,
    amountInBaseCurrency: amount,
    currency: INR,
    date: "2026-11-20T00:00:00.000Z",
    description: "",
    category: { _id: "c", name: "Travel" },
    department: { _id: "d", name: "Sales" },
    createdBy: { _id: `u-${submitter}`, name: submitter, email: "x@example.com" },
    approvalStatus: "pending",
  };
}

describe("toggleReason", () => {
  it("adds a phrase after what's typed and takes it out again", () => {
    expect(toggleReason("", "Duplicate")).toBe("Duplicate");
    expect(toggleReason("Same bill as last week.", "Duplicate")).toBe("Same bill as last week. Duplicate");
    expect(toggleReason("Duplicate. Not a business expense", "Duplicate")).toBe("Not a business expense");
    expect(toggleReason("Not a business expense. Duplicate", "Duplicate")).toBe("Not a business expense");
  });
});

describe("RejectDialog", () => {
  it("requires a reason, shows a counter and confirms with the trimmed text", () => {
    const onConfirm = vi.fn();
    render(<RejectDialog isOpen expenses={[expense("e1", "Taxi", 450)]} onClose={vi.fn()} onConfirm={onConfirm} />);
    const dialog = screen.getByRole("dialog", { name: "Reject expense" });
    expect(within(dialog).getByText(/Asha Rao will see your reason/)).toBeInTheDocument();

    const reason = within(dialog).getByLabelText("Reason — the submitter will see this");
    fireEvent.change(reason, { target: { value: " ok " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Reject expense" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(within(dialog).getByText("Add a reason so the submitter knows what to fix.")).toBeInTheDocument();
    expect(reason).toHaveAttribute("aria-invalid", "true");
    expect(reason).toHaveFocus();

    fireEvent.change(reason, { target: { value: "  Wrong client  " } });
    expect(within(dialog).getByText("12 / 500 characters · at least 3")).toBeInTheDocument();
    expect(reason).toHaveAttribute("maxLength", "500");
    fireEvent.click(within(dialog).getByRole("button", { name: "Reject expense" }));
    expect(onConfirm).toHaveBeenCalledWith("Wrong client");
  });

  it("fills the reason from quick reasons, which show as pressed", () => {
    const onConfirm = vi.fn();
    render(
      <RejectDialog
        isOpen
        expenses={[expense("e1", "Taxi", 450), expense("e2", "Hotel", 3000, "Ravi Iyer")]}
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />
    );
    const dialog = screen.getByRole("dialog", { name: "Reject 2 expenses" });
    expect(within(dialog).getByText(/The submitters will see your reason/)).toBeInTheDocument();
    const chip = within(dialog).getByRole("button", { name: "Duplicate" });
    fireEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByRole("textbox")).toHaveValue("Duplicate");
    fireEvent.click(within(dialog).getByRole("button", { name: "Reject 2 expenses" }));
    expect(onConfirm).toHaveBeenCalledWith("Duplicate");
  });
});
