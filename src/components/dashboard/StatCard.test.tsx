import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatCard } from "./StatCard";
import { Receipt } from "lucide-react";

describe("StatCard", () => {
  it("should render the correct label and value", () => {
    render(
      <StatCard
        label="Total Expenses"
        value="$1,234.56"
        icon={Receipt}
        gradient="from-blue-500 to-blue-600"
        bgGlow="bg-blue-500/10"
        href="/dashboard/expenses"
      />
    );

    expect(screen.getByText("Total Expenses")).toBeInTheDocument();
    expect(screen.getByText("$1,234.56")).toBeInTheDocument();
  });

  it("should apply flex-shrink-0 to the icon wrapper to prevent layout squishing", () => {
    const { container } = render(
      <StatCard
        label="Total Amount"
        value="A very very large amount string that might wrap"
        icon={Receipt}
        gradient="from-blue-500 to-blue-600"
        bgGlow="bg-blue-500/10"
        href="/dashboard/expenses"
      />
    );

    // The icon wrapper should have flex-shrink-0 to maintain aspect ratio
    const iconWrapper = container.querySelector(".flex-shrink-0");
    expect(iconWrapper).toBeInTheDocument();
  });
});
