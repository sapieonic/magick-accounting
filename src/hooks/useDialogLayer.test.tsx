import { useRef, type ReactNode } from "react";
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

    it("falls back to #main when the opener is still there but hidden (More at lg)", () => {
      withLayout((el) => el.hasAttribute("data-hidden"));
      function Harness({ open, hidden }: { open: boolean; hidden: boolean }) {
        return (
          <MainShell>
            <button data-hidden={hidden ? "" : undefined}>More</button>
            <Layer open={open} label="Drawer">
              <a href="#x">Trips</a>
            </Layer>
          </MainShell>
        );
      }
      const { rerender } = render(<Harness open={false} hidden={false} />);
      screen.getByRole("button", { name: "More" }).focus();
      rerender(<Harness open hidden={false} />);
      rerender(<Harness open hidden />);
      rerender(<Harness open={false} hidden />);
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

  describe("Escape", () => {
    it("closes only the topmost layer", () => {
      const closeOuter = vi.fn();
      const closeInner = vi.fn();
      render(
        <Layer open onClose={closeOuter} label="Outer">
          <Layer open onClose={closeInner} label="Inner" />
        </Layer>
      );
      fireEvent.keyDown(document, { key: "Escape" });
      expect(closeInner).toHaveBeenCalledTimes(1);
      expect(closeOuter).not.toHaveBeenCalled();
    });

    it("leaves an Escape that a control inside already handled", () => {
      const onClose = vi.fn();
      render(
        <Layer open onClose={onClose} label="Dialog">
          <button onKeyDown={(e) => e.key === "Escape" && e.preventDefault()}>Menu</button>
        </Layer>
      );
      const menu = screen.getByRole("button", { name: "Menu" });
      fireEvent.keyDown(menu, { key: "Escape" });
      expect(onClose).not.toHaveBeenCalled();
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
