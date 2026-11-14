import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Trash2 } from "lucide-react";
import Button, { IconButton } from "@/components/ui/Button";

describe("Button loading spinner", () => {
  it("uses the shared Spinner in the text colour, hidden from assistive tech", () => {
    render(<Button loading>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    const ring = button.querySelector(".animate-spin");
    expect(ring?.tagName).toBe("SPAN");
    expect(ring).toHaveAttribute("aria-hidden", "true");
    expect(ring).toHaveClass("h-4", "w-4", "border-current", "border-r-transparent");
    // The button's aria-busy is the status; no extra "Loading" status inside it.
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("uses the same spinner in an icon button", () => {
    render(<IconButton icon={Trash2} aria-label="Delete" loading />);
    const ring = screen.getByRole("button", { name: "Delete" }).querySelector(".animate-spin");
    expect(ring).toHaveClass("border-current");
  });
});
