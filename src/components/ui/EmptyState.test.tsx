import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import EmptyState from "@/components/ui/EmptyState";

describe("EmptyState", () => {
  it("renders the title and description", () => {
    render(
      <EmptyState icon={<span>icon</span>} title="Nothing here" description="Try again later" />
    );
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    expect(screen.getByText("Try again later")).toBeInTheDocument();
  });

  it("renders the provided icon", () => {
    render(
      <EmptyState
        icon={<span data-testid="empty-icon">my-icon</span>}
        title="Nothing here"
        description="Try again later"
      />
    );
    expect(screen.getByTestId("empty-icon")).toBeInTheDocument();
  });

  it("renders the action node when provided", () => {
    render(
      <EmptyState
        icon={<span>icon</span>}
        title="Nothing here"
        description="Try again later"
        action={<button>Add item</button>}
      />
    );
    expect(screen.getByRole("button", { name: "Add item" })).toBeInTheDocument();
  });

  it("omits the action when not provided", () => {
    render(<EmptyState icon={<span>icon</span>} title="Nothing here" description="Try again later" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
