import type { MatcherFunction } from "@testing-library/react";

/** Visible text of an element: its text without `sr-only` descendants. */
function visibleText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (node instanceof Element && node.classList.contains("sr-only")) return "";
  return Array.from(node.childNodes).map(visibleText).join("");
}

/**
 * Text matcher for a formatted amount. Amounts render their paisa in a span of
 * its own (`withPaise`), so a plain `getByText("₹12,500.00")` no longer finds
 * them; this matches the innermost element that shows exactly `text`
 * (screen-reader-only notes inside it are ignored, as a sighted reader would).
 */
export function byAmount(text: string): MatcherFunction {
  return (_content, element) => {
    // Dropping sr-only text only shortens it: anything shorter can't match.
    if (!element || (element.textContent ?? "").length < text.length) return false;
    if (visibleText(element) !== text) return false;
    return !Array.from(element.children).some((child) => visibleText(child) === text);
  };
}
