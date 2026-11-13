import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Modal, { ModalFooter } from "@/components/ui/Modal";

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

  it("moves focus into the dialog and traps Tab inside it", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button>Outside</button>
        <Modal isOpen onClose={vi.fn()} title="My Modal">
          <input aria-label="Name" />
          <button>Save</button>
        </Modal>
      </>
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    const close = screen.getByRole("button", { name: /close dialog/i });
    const save = screen.getByRole("button", { name: "Save" });
    save.focus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(save).toHaveFocus();
    expect(screen.getByRole("button", { name: "Outside" })).not.toHaveFocus();
  });

  it("returns focus to the opener when it closes", () => {
    function Harness({ open }: { open: boolean }) {
      return (
        <>
          <button>Open dialog</button>
          <Modal isOpen={open} onClose={vi.fn()} title="My Modal">
            <p>Body</p>
          </Modal>
        </>
      );
    }
    const { rerender } = render(<Harness open={false} />);
    const opener = screen.getByRole("button", { name: "Open dialog" });
    opener.focus();

    rerender(<Harness open />);
    expect(opener).not.toHaveFocus();
    rerender(<Harness open={false} />);
    expect(opener).toHaveFocus();
  });

  it("closes only the topmost dialog on Escape", async () => {
    const user = userEvent.setup();
    const closeOuter = vi.fn();
    const closeInner = vi.fn();
    render(
      <Modal isOpen onClose={closeOuter} title="Outer">
        <Modal isOpen onClose={closeInner} title="Inner">
          <p>Inner body</p>
        </Modal>
      </Modal>
    );
    await user.keyboard("{Escape}");
    expect(closeInner).toHaveBeenCalledTimes(1);
    expect(closeOuter).not.toHaveBeenCalled();
  });

  it("closes only the dialog opened last on Escape, then the one below it", async () => {
    const user = userEvent.setup();
    const closeFirst = vi.fn();
    const closeSecond = vi.fn();
    const dialogs = (second: boolean) => (
      <>
        <Modal isOpen onClose={closeFirst} title="First">
          <p>First body</p>
        </Modal>
        <Modal isOpen={second} onClose={closeSecond} title="Second">
          <p>Second body</p>
        </Modal>
      </>
    );
    const { rerender } = render(dialogs(false));
    rerender(dialogs(true));

    await user.keyboard("{Escape}");
    expect(closeSecond).toHaveBeenCalledTimes(1);
    expect(closeFirst).not.toHaveBeenCalled();

    rerender(dialogs(false));
    await user.keyboard("{Escape}");
    expect(closeFirst).toHaveBeenCalledTimes(1);
    expect(closeSecond).toHaveBeenCalledTimes(1);
  });

  it("pins the footer flush with the sheet edge, cancelling the body padding", () => {
    render(
      <Modal isOpen onClose={vi.fn()} title="My Modal">
        <ModalFooter>
          <button>Save</button>
        </ModalFooter>
      </Modal>
    );
    const footer = screen.getByRole("button", { name: "Save" }).parentElement!;
    expect(footer.parentElement).toHaveClass("py-4");
    expect(footer).toHaveClass("sticky", "-bottom-4", "-mb-4");
  });

  it("uses the overlay token for the backdrop", () => {
    render(
      <Modal isOpen onClose={vi.fn()} title="My Modal">
        <p>Body</p>
      </Modal>
    );
    expect(screen.getByRole("dialog").className).toMatch(/\bbg-overlay\/45\b/);
  });

  it("keeps focus on an autoFocus field and still returns focus to the opener", () => {
    function Harness({ open }: { open: boolean }) {
      return (
        <>
          <button>Add domain</button>
          <Modal isOpen={open} onClose={vi.fn()} title="Add email domain">
            {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
            <input aria-label="Domain" autoFocus />
          </Modal>
        </>
      );
    }
    const { rerender } = render(<Harness open={false} />);
    const opener = screen.getByRole("button", { name: "Add domain" });
    opener.focus();

    rerender(<Harness open />);
    expect(screen.getByLabelText("Domain")).toHaveFocus();
    rerender(<Harness open={false} />);
    expect(opener).toHaveFocus();
  });
});
