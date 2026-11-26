import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { formatBaseCurrency, formatCurrency } from "@/lib/currency";
import { splitPaise, withPaise } from "@/components/ui/Money";

describe("splitPaise", () => {
  it.each([
    ["₹2,42,356.12", "₹2,42,356", ".12"],
    ["-₹1,234.50", "-₹1,234", ".50"],
    ["₹0.00", "₹0", ".00"],
    ["$1,702.40", "$1,702", ".40"],
  ])("splits %s", (text, whole, paise) => {
    expect(splitPaise(text)).toEqual([whole, paise]);
  });

  it("splits whatever formatCurrency writes, sign or code first", () => {
    for (const formatted of [
      formatBaseCurrency(1234.5),
      formatBaseCurrency(-0.4),
      formatCurrency(1234, "JPY"),
      formatCurrency(10_000_000, "AED"),
      formatCurrency(5, "XYZ"),
    ]) {
      const [whole, paise] = splitPaise(formatted);
      expect(paise).toMatch(/^\.\d{2}$/);
      expect(whole + paise).toBe(formatted);
    }
  });

  it.each(["3.25", "v1.16", "₹3.12L", "12.50%", "₹950", "Total 4.00 items", ""])("leaves %j whole", (text) => {
    expect(splitPaise(text)).toEqual([text, ""]);
  });
});

describe("withPaise", () => {
  it("wraps the paisa in a .paise span and keeps the text one figure", () => {
    const { container } = render(<span>{withPaise("₹7,620.00")}</span>);
    expect(container.textContent).toBe("₹7,620.00");
    expect(container.querySelector(".paise")).toHaveTextContent(".00");
  });

  it("passes non-money strings and elements through", () => {
    expect(withPaise("12.50%")).toBe("12.50%");
    const node = <b>₹1.00</b>;
    expect(withPaise(node)).toBe(node);
  });
});
