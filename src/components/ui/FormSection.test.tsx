import { describe, it, expect, vi, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { FormFooter, FORM_FOOTER_HEIGHT_VAR } from "@/components/ui/FormSection";

const footerHeight = () => document.documentElement.style.getPropertyValue(FORM_FOOTER_HEIGHT_VAR);

describe("FormFooter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sticks just above the mobile tab bar via --tabbar-h (0 from lg up)", () => {
    const { container } = render(<FormFooter>Save</FormFooter>);
    const footer = container.firstElementChild as HTMLElement;
    expect(footer).toHaveClass("sticky", "bottom-[var(--tabbar-h)]");
    expect(footer.className).not.toMatch(/55px/);
  });

  it("publishes its measured height on <html> while mounted and tracks resizes", () => {
    let onResize: () => void = () => {};
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(cb: () => void) {
          onResize = cb;
        }
        observe = observe;
        disconnect = disconnect;
        unobserve() {}
      }
    );
    let height = 69;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () => ({ height }) as DOMRect
    );

    const { container, unmount } = render(<FormFooter>Save</FormFooter>);
    expect(observe).toHaveBeenCalledWith(container.firstElementChild);
    expect(footerHeight()).toBe("69px");

    // The footer wraps onto two lines on a phone.
    height = 100.4;
    act(() => onResize());
    expect(footerHeight()).toBe("101px");

    unmount();
    expect(disconnect).toHaveBeenCalled();
    expect(footerHeight()).toBe("");
  });

  it("still publishes a height without ResizeObserver", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({ height: 69 }) as DOMRect);
    const { unmount } = render(<FormFooter>Save</FormFooter>);
    expect(footerHeight()).toBe("69px");
    unmount();
    expect(footerHeight()).toBe("");
  });
});
