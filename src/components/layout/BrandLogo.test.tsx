import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import BrandLogo from "./BrandLogo";

describe("BrandLogo", () => {
  it("renders the MagickVoice Accounting portal lockup", () => {
    render(<BrandLogo />);

    expect(screen.getByText("MagickVoice")).toBeInTheDocument();
    expect(screen.getByText("Accounting portal")).toBeInTheDocument();
    expect(screen.getByText("MagickVoice").className).not.toMatch(/truncate/);
    expect(screen.getByText("Accounting portal").className).not.toMatch(/truncate/);
  });

  it("does not paint an opaque background behind the transparent mark in light mode", () => {
    const { container } = render(<BrandLogo />);
    const mark = container.querySelector('img[src="/logo.png"]')?.parentElement;

    expect(mark).toBeTruthy();
    expect(mark?.className).not.toMatch(/(^|\s)bg-/);
  });

  it.each([{ compact: false }, { compact: true }])(
    "puts the mark on the rail's white tile in dark mode (%o)",
    ({ compact }) => {
      const { container } = render(<BrandLogo compact={compact} size="sm" />);
      const mark = container.querySelector('img[src="/logo.png"]')?.parentElement;

      expect(mark).toHaveClass("dark:bg-white", "dark:p-[3px]", "dark:rounded-md");
    }
  );

  it("always tiles the mark on dark surfaces", () => {
    const { container } = render(<BrandLogo variant="onDark" compact />);
    const mark = container.querySelector('img[src="/logo.png"]')?.parentElement;

    expect(mark).toHaveClass("bg-white", "p-[3px]", "rounded-md");
  });

  it("hides the wordmark in compact mode", () => {
    render(<BrandLogo compact />);

    expect(screen.queryByText("MagickVoice")).not.toBeInTheDocument();
    expect(screen.queryByText("Accounting portal")).not.toBeInTheDocument();
    expect(screen.getByAltText("MagickVoice Accounting portal")).toBeInTheDocument();
  });
});
