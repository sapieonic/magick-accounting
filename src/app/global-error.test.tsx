import { describe, it, expect, afterEach } from "vitest";
import { renderToString } from "react-dom/server";
import GlobalError from "@/app/global-error";
import { THEME_BOOT_SCRIPT, THEME_STORAGE_KEY } from "@/lib/theme";

describe("theme boot script", () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    document.documentElement.style.colorScheme = "";
  });

  it("applies a saved dark theme to <html>", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    new Function(THEME_BOOT_SCRIPT)();
    expect(document.documentElement).toHaveClass("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("defaults to light", () => {
    new Function(THEME_BOOT_SCRIPT)();
    expect(document.documentElement).not.toHaveClass("dark");
    expect(document.documentElement.style.colorScheme).toBe("light");
  });
});

describe("GlobalError", () => {
  it("server-renders the theme boot script in its own <head> (no light flash)", () => {
    const html = renderToString(<GlobalError error={new Error("boom")} reset={() => {}} />);
    const head = html.slice(html.indexOf("<head>"), html.indexOf("</head>"));
    expect(head).toContain("<script>");
    expect(head).toContain(`localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})`);
    expect(html).toContain("Something went wrong");
  });
});
