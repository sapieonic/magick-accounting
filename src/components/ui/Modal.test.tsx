import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Modal from "@/components/ui/Modal";

describe("Modal", () => {
  afterEach(() => {
    document.body.style.overflow = "";
  });

  it("renders nothing when isOpen is false", () => {
    const { container } = render(
      <Modal isOpen={false} onClose={vi.fn()} title="My Modal">
        <p>Body content</p>
      </Modal>
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText("Body content")).not.toBeInTheDocument();
  });

  it("renders title and children when open", () => {
    render(
      <Modal isOpen onClose={vi.fn()} title="My Modal">
        <p>Body content</p>
      </Modal>
    );
    expect(screen.getByRole("heading", { name: "My Modal" })).toBeInTheDocument();
    expect(screen.getByText("Body content")).toBeInTheDocument();
  });

  it('has role="dialog" with aria-modal and aria-label', () => {
    render(
      <Modal isOpen onClose={vi.fn()} title="My Modal">
        <p>Body</p>
      </Modal>
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-label", "My Modal");
  });

  it("calls onClose when the X button is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="My Modal">
        <p>Body</p>
      </Modal>
    );
    await user.click(screen.getByRole("button", { name: /close dialog/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Escape is pressed", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="My Modal">
        <p>Body</p>
      </Modal>
    );
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when clicking the overlay backdrop", () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="My Modal">
        <p>Body</p>
      </Modal>
    );
    // The overlay is the dialog element itself; clicking it (target === overlay) closes.
    const overlay = screen.getByRole("dialog");
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does NOT call onClose when clicking inside the content", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="My Modal">
        <p>Body content</p>
      </Modal>
    );
    await user.click(screen.getByText("Body content"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('sets body overflow to "hidden" when open and restores it on close', () => {
    const { rerender } = render(
      <Modal isOpen onClose={vi.fn()} title="My Modal">
        <p>Body</p>
      </Modal>
    );
    expect(document.body.style.overflow).toBe("hidden");

    rerender(
      <Modal isOpen={false} onClose={vi.fn()} title="My Modal">
        <p>Body</p>
      </Modal>
    );
    expect(document.body.style.overflow).toBe("");
  });

  it("restores body overflow on unmount", () => {
    const { unmount } = render(
      <Modal isOpen onClose={vi.fn()} title="My Modal">
        <p>Body</p>
      </Modal>
    );
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });
});
