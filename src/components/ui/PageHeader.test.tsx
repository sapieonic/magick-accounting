import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import PageHeader from "@/components/ui/PageHeader";
import Field from "@/components/ui/Field";

describe("PageHeader breadcrumb", () => {
  it("gives breadcrumb links a 24px target (WCAG 2.5.8)", () => {
    render(<PageHeader title="Mumbai" breadcrumb={[{ label: "Trips", href: "/dashboard/trips" }, { label: "Mumbai" }]} />);
    expect(screen.getByRole("link", { name: "Trips" })).toHaveClass("inline-flex", "min-h-6", "items-center");
  });
});

describe("Field aside", () => {
  it("keeps the aside on one line so labels in a row stay level", () => {
    render(
      <Field label="GST amount" optional aside={<span>from receipt</span>}>
        <input />
      </Field>
    );
    expect(screen.getByText("from receipt").parentElement).toHaveClass("shrink-0", "whitespace-nowrap");
  });
});
