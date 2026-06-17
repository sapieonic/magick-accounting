import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Spinner, { InlineLoader, PageLoader } from "@/components/ui/Spinner";

describe("Spinner", () => {
  it("renders with a status role and Loading aria-label", () => {
    render(<Spinner />);
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
  });

  it("defaults to the md size shell class", () => {
    render(<Spinner />);
    expect(screen.getByRole("status")).toHaveClass("h-6", "w-6");
  });

  it("applies sm size classes", () => {
    render(<Spinner size="sm" />);
    expect(screen.getByRole("status")).toHaveClass("h-4", "w-4");
  });

  it("applies lg size classes", () => {
    render(<Spinner size="lg" />);
    expect(screen.getByRole("status")).toHaveClass("h-12", "w-12");
  });

  it("merges a custom className", () => {
    render(<Spinner className="custom-class" />);
    expect(screen.getByRole("status")).toHaveClass("custom-class");
  });
});

describe("InlineLoader", () => {
  it("renders the default label", () => {
    render(<InlineLoader />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("renders a custom label", () => {
    render(<InlineLoader label="Fetching data" />);
    expect(screen.getByText("Fetching data")).toBeInTheDocument();
  });

  it("contains a Spinner (status role) with the sm size", () => {
    render(<InlineLoader />);
    expect(screen.getByRole("status")).toHaveClass("h-4", "w-4");
  });

  it("applies a custom className to the wrapper", () => {
    const { container } = render(<InlineLoader className="my-wrap" />);
    expect(container.querySelector(".my-wrap")).toBeInTheDocument();
  });
});

describe("PageLoader", () => {
  it("renders its loading copy", () => {
    render(<PageLoader />);
    expect(screen.getByText("Loading data...")).toBeInTheDocument();
    expect(
      screen.getByText("Serverless APIs can take a few seconds to warm up.")
    ).toBeInTheDocument();
  });

  it("renders a large Spinner", () => {
    render(<PageLoader />);
    expect(screen.getByRole("status")).toHaveClass("h-12", "w-12");
  });
});
