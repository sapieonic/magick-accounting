import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import Checkbox from "@/components/ui/Checkbox";

const box = (container: HTMLElement) => container.firstElementChild as HTMLElement;

describe("Checkbox", () => {
  it("draws an unchecked box with the >= 3:1 control-line border", () => {
    const { container } = render(<Checkbox checked={false} />);
    expect(box(container)).toHaveAttribute("aria-hidden", "true");
    expect(box(container)).toHaveClass("border-control-line", "bg-surface");
    expect(box(container)).not.toHaveClass("border-rule");
    expect(box(container).querySelector(".lucide-check")).toBeNull();
  });

  it("fills with the accent and shows a tick when checked", () => {
    const { container } = render(<Checkbox checked />);
    expect(box(container)).toHaveClass("border-accent", "bg-accent", "text-accent-ink");
    expect(box(container).querySelector(".lucide-check")).not.toBeNull();
  });

  it("shows a dash when partially checked", () => {
    const { container } = render(<Checkbox checked={false} partial />);
    expect(box(container)).toHaveClass("bg-accent");
    expect(box(container).querySelector(".lucide-check")).toBeNull();
    expect(box(container).querySelector("span")).toHaveClass("bg-accent-ink");
  });
});
