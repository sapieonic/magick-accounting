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

  it("does not paint an opaque background behind the transparent mark", () => {
    const { container } = render(<BrandLogo />);
    const mark = container.querySelector('img[src="/logo.png"]')?.parentElement;

    expect(mark).toBeTruthy();
    expect(mark?.className).not.toMatch(/bg-/);
  });

  it("can ellipsize the wordmark when the parent is narrow", () => {
    render(<BrandLogo truncate />);

    expect(screen.getByText("MagickVoice").className).toMatch(/truncate/);
    expect(screen.getByText("Accounting portal").className).toMatch(/truncate/);
  });

  it("hides the wordmark in compact mode", () => {
    render(<BrandLogo compact />);

    expect(screen.queryByText("MagickVoice")).not.toBeInTheDocument();
    expect(screen.queryByText("Accounting portal")).not.toBeInTheDocument();
    expect(screen.getByAltText("MagickVoice Accounting portal")).toBeInTheDocument();
  });
});
