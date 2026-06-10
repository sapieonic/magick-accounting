import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Skeleton, {
  ListPageSkeleton,
  ExpenseListSkeleton,
  DashboardSkeleton,
  FormSkeleton,
} from "@/components/ui/Skeleton";

describe("Skeleton", () => {
  it("is hidden from assistive technology", () => {
    const { container } = render(<Skeleton className="h-4 w-4" />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  it("merges custom class names", () => {
    const { container } = render(<Skeleton className="h-10 w-20" />);
    expect(container.firstElementChild).toHaveClass("h-10", "w-20", "animate-pulse");
  });
});

describe("page skeletons", () => {
  it("ListPageSkeleton exposes a loading status with the requested row count", () => {
    const { container } = render(<ListPageSkeleton rows={3} />);
    expect(screen.getByRole("status", { name: /loading content/i })).toBeInTheDocument();
    expect(container.querySelectorAll(".h-\\[72px\\]")).toHaveLength(3);
  });

  it("ExpenseListSkeleton exposes a loading status", () => {
    render(<ExpenseListSkeleton />);
    expect(screen.getByRole("status", { name: /loading expenses/i })).toBeInTheDocument();
  });

  it("DashboardSkeleton exposes a loading status", () => {
    render(<DashboardSkeleton />);
    expect(screen.getByRole("status", { name: /loading dashboard/i })).toBeInTheDocument();
  });

  it("FormSkeleton exposes a loading status", () => {
    render(<FormSkeleton />);
    expect(screen.getByRole("status", { name: /loading form/i })).toBeInTheDocument();
  });
});
