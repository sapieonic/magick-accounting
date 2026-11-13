import { useRef, useState, type ReactNode } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useDialogLayer } from "@/hooks/useDialogLayer";

function Layer({ open, onClose = () => {}, label, children }: { open: boolean; onClose?: () => void; label: string; children?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogLayer(open, ref, onClose);
  if (!open) return null;
  return (
    <div ref={ref} tabIndex={-1} role="dialog" aria-label={label}>
      {children}
    </div>
  );
}

const rect = { top: 0, left: 0, bottom: 10, right: 10, width: 10, height: 10, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
const rects = (n: number) => Object.assign(Array.from({ length: n }, () => rect), { item: () => rect }) as unknown as DOMRectList;

/** Pretend layout exists (unlike jsdom): `hidden` elements have no boxes, everything else one. */
function withLayout(isHidden: (el: Element) => boolean) {
  vi.spyOn(Element.prototype, "getClientRects").mockImplementation(function (this: Element) {
    return rects(isHidden(this) ? 0 : 1);
  });
}

function MainShell({ children }: { children: ReactNode }) {
  return (
    <main id="main" tabIndex={-1} style={{ overflow: "auto" }}>
      {children}
    </main>
  );
}

describe("useDialogLayer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Tab trap", () => {
    it("skips elements that aren't rendered when layout exists", async () => {
      withLayout((el) => el.hasAttribute("data-hidden"));
      const user = userEvent.setup();
      render(
        <Layer open label="Dialog">
          <button>First</button>
          <button>Last visible</button>
          <button data-hidden="">Hidden</button>
        </Layer>
      );
      screen.getByRole("button", { name: "Last visible" }).focus();
      await user.tab();
      expect(screen.getByRole("button", { name: "First" })).toHaveFocus();
    });

    it("leaves Tab alone while its container isn't rendered (a drawer hidden at lg)", () => {
      withLayout((el) => el.closest("[data-hidden]") !== null);
      render(
        <>
          <button>Page</button>
          <div data-hidden="">
            <Layer open label="Drawer">
              <button>In drawer</button>
            </Layer>
          </div>
        </>
      );
      // Focus is out on the page (the trap would pull it back in).
      const page = screen.getByRole("button", { name: "Page" });
      page.focus();
      const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
      page.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      expect(page).toHaveFocus();
    });

    it("still keeps focus in a rendered container with nothing focusable", () => {
      withLayout(() => false);
      render(<Layer open label="Notice">Nothing to press</Layer>);
      const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
      document.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(screen.getByRole("dialog")).toHaveFocus();
    });
  });

  describe("focus restore", () => {
    it("falls back to #main when the opener was removed while open", () => {
      function Harness({ open, withRow }: { open: boolean; withRow: boolean }) {
        return (
          <MainShell>
            {withRow && <button>Delete row</button>}
            <Layer open={open} label="Confirm" />
          </MainShell>
        );
      }
      const { rerender } = render(<Harness open={false} withRow />);
      screen.getByRole("button", { name: "Delete row" }).focus();
      rerender(<Harness open withRow />);
      rerender(<Harness open withRow={false} />);
      rerender(<Harness open={false} withRow={false} />);
      expect(document.getElementById("main")).toHaveFocus();
    });

    it("falls back to the layer below when one is still open", () => {
      function Harness({ inner, withOpener }: { inner: boolean; withOpener: boolean }) {
        return (
          <MainShell>
            <Layer open label="Outer">
              {withOpener && <button>Remove</button>}
              <Layer open={inner} label="Inner" />
            </Layer>
          </MainShell>
        );
      }
      const { rerender } = render(<Harness inner={false} withOpener />);
      screen.getByRole("button", { name: "Remove" }).focus();
      rerender(<Harness inner withOpener />);
      rerender(<Harness inner withOpener={false} />);
      rerender(<Harness inner={false} withOpener={false} />);
      expect(screen.getByRole("dialog", { name: "Outer" })).toHaveFocus();
    });

    it("still returns focus to an opener that is there", () => {
      function Harness({ open }: { open: boolean }) {
        return (
          <MainShell>
            <button>Open</button>
            <Layer open={open} label="Dialog" />
          </MainShell>
        );
      }
      const { rerender } = render(<Harness open={false} />);
      const opener = screen.getByRole("button", { name: "Open" });
      opener.focus();
      rerender(<Harness open />);
      rerender(<Harness open={false} />);
      expect(opener).toHaveFocus();
    });
  });

  describe("scroll lock", () => {
    it("locks the #main scroller while any layer is open, ref-counted", () => {
      function Harness({ a, b }: { a: boolean; b: boolean }) {
        return (
          <MainShell>
            <Layer open={a} label="A" />
            <Layer open={b} label="B" />
          </MainShell>
        );
      }
      const { rerender } = render(<Harness a={false} b={false} />);
      const main = document.getElementById("main")!;
      expect(main.style.overflow).toBe("auto");

      rerender(<Harness a b={false} />);
      expect(main.style.overflow).toBe("hidden");
      rerender(<Harness a b />);
      // The first one closing must not unlock while the second is open.
      rerender(<Harness a={false} b />);
      expect(main.style.overflow).toBe("hidden");
      rerender(<Harness a={false} b={false} />);
      expect(main.style.overflow).toBe("auto");
      expect(document.body.style.overflow).toBe("");
    });

    it("unlocks when an open layer unmounts", () => {
      const { unmount } = render(
        <MainShell>
          <Layer open label="A" />
        </MainShell>
      );
      const main = document.getElementById("main")!;
      expect(main.style.overflow).toBe("hidden");
      unmount();
      expect(main.style.overflow).toBe("auto");
    });
  });

  describe("popup layers", () => {
    function Popup({ onClose }: { onClose: () => void }) {
      const trigger = useRef<HTMLButtonElement>(null);
      const menu = useRef<HTMLDivElement>(null);
      const [open, setOpen] = useState(false);
      useDialogLayer(open, menu, () => { setOpen(false); onClose(); }, { popup: true, returnFocus: trigger });
      return (
        <>
          <button ref={trigger} onClick={() => setOpen(true)}>Menu</button>
          {open && (
            <div ref={menu}>
              <button tabIndex={-1}>Item</button>
            </div>
          )}
        </>
      );
    }

    it("doesn't take focus on open, and Escape closes only the popup", async () => {
      const user = userEvent.setup();
      const closeDialog = vi.fn();
      const closePopup = vi.fn();
      render(
        <MainShell>
          <Layer open onClose={closeDialog} label="Dialog">
            <Popup onClose={closePopup} />
          </Layer>
        </MainShell>
      );
      const trigger = screen.getByRole("button", { name: "Menu" });
      await user.click(trigger);
      expect(trigger).toHaveFocus();
      expect(screen.getByRole("button", { name: "Item" })).toBeInTheDocument();

      fireEvent.keyDown(document, { key: "Escape" });
      expect(closePopup).toHaveBeenCalledTimes(1);
      expect(closeDialog).not.toHaveBeenCalled();
      fireEvent.keyDown(document, { key: "Escape" });
      expect(closeDialog).toHaveBeenCalledTimes(1);
    });
  });
});
