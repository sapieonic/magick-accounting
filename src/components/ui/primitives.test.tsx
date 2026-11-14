import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Plus, Trash2 } from "lucide-react";
import Button, { IconButton } from "@/components/ui/Button";
import Field, { inputClass } from "@/components/ui/Field";
import Panel, { PanelGrid } from "@/components/ui/Panel";
import StatBand, { Stat } from "@/components/ui/StatBand";
import SegmentedControl from "@/components/ui/SegmentedControl";
import SplitBar from "@/components/ui/SplitBar";
import RankedBar from "@/components/ui/RankedBar";
import CategoryGlyph, { categoryTone } from "@/components/ui/CategoryGlyph";
import PageHeader from "@/components/ui/PageHeader";
import Avatar, { initials } from "@/components/ui/Avatar";
import { Chip, RemovableChip } from "@/components/ui/Badge";
import SearchInput from "@/components/ui/SearchInput";

describe("Button", () => {
  it("renders a button by default and a link with href", () => {
    const { rerender } = render(<Button icon={Plus}>Add</Button>);
    expect(screen.getByRole("button", { name: "Add" })).toHaveAttribute("type", "button");

    rerender(<Button href="/dashboard/expenses/new">New expense</Button>);
    expect(screen.getByRole("link", { name: "New expense" })).toHaveAttribute("href", "/dashboard/expenses/new");
  });

  it("disables itself while loading", () => {
    render(<Button loading>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("gives icon-only buttons their label as accessible name", () => {
    render(<IconButton icon={Trash2} aria-label="Delete expense" />);
    expect(screen.getByRole("button", { name: "Delete expense" })).toBeInTheDocument();
  });
});

describe("Field", () => {
  it("labels its control and wires hint and error", () => {
    const { rerender } = render(
      <Field label="Amount" hint="In the bill's currency">
        <input className={inputClass} />
      </Field>
    );
    const input = screen.getByLabelText("Amount");
    expect(input).toHaveAccessibleDescription("In the bill's currency");

    rerender(
      <Field label="Amount" hint="In the bill's currency" error="Enter an amount">
        <input className={inputClass} />
      </Field>
    );
    expect(screen.getByLabelText("Amount")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Amount")).toHaveAccessibleDescription("Enter an amount");
  });
});

describe("layout primitives", () => {
  it("names panels by their title", () => {
    render(
      <PanelGrid>
        <Panel title="Categories">body</Panel>
      </PanelGrid>
    );
    expect(screen.getByRole("region", { name: "Categories" })).toBeInTheDocument();
  });

  it("renders a page title with breadcrumb and actions", () => {
    render(
      <PageHeader
        title="Mumbai client meetings"
        breadcrumb={[{ label: "Trips", href: "/dashboard/trips" }, { label: "Mumbai" }]}
        actions={<Button>Edit</Button>}
      />
    );
    expect(screen.getByRole("heading", { level: 1, name: "Mumbai client meetings" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Trips" })).toHaveAttribute("href", "/dashboard/trips");
  });

  it("renders stats inside a labelled band", () => {
    render(
      <StatBand>
        <Stat headline label="Total spend" value="₹18,01,807.59" sub="309 expenses" />
        <Stat label="Paid from pocket" value="₹3,39,267.25" tone="amber" />
      </StatBand>
    );
    expect(screen.getByRole("region", { name: "Totals" })).toHaveTextContent("₹18,01,807.59");
  });

  it("top-aligns stats so one without a sub line sits level with the rest", () => {
    render(
      <StatBand>
        <Stat label="Capitalized value" value="₹6,01,423.72" sub="All company assets" />
        <Stat label="Active assets" value="3" />
      </StatBand>
    );
    const cell = screen.getByText("Active assets").parentElement!;
    expect(cell).toHaveClass("justify-start");
    expect(cell).not.toHaveClass("justify-between");
  });
});

describe("SegmentedControl", () => {
  it("marks the current option and reports changes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SegmentedControl
        aria-label="Date range"
        value="all"
        onChange={onChange}
        options={[
          { value: "all", label: "All time" },
          { value: "month", label: "This month" },
        ]}
      />
    );
    expect(screen.getByRole("button", { name: "All time" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "This month" }));
    expect(onChange).toHaveBeenCalledWith("month");
  });
});

describe("data primitives", () => {
  it("describes the company/pocket split", () => {
    render(<SplitBar company={812} pocket={188} format={(n) => `₹${n}`} />);
    expect(screen.getByRole("img", { name: "Company paid 81.2%, pocket 18.8%" })).toBeInTheDocument();
    expect(screen.getByText("₹812")).toBeInTheDocument();
  });

  it("shows a ranked row's share and amount", () => {
    render(<RankedBar label="Travel" amount="₹1,02,769.18" share={5.7} ratio={0.1} />);
    expect(screen.getByText("5.7%")).toBeInTheDocument();
    expect(screen.getByText("₹1,02,769.18")).toBeInTheDocument();
  });

  it("truncates a ranked row's label, never its share", () => {
    render(<RankedBar label="Food & drinks 1 item" amount="₹10" share={12.5} ratio={0.5} />);
    const label = screen.getByText("Food & drinks 1 item");
    const share = screen.getByText("12.5%");
    expect(label).toHaveClass("ell");
    expect(label).not.toContainElement(share);
    expect(share).toHaveClass("shrink-0");
    expect(share.closest(".ell")).toBeNull();
  });

  it.each([
    [Number.NaN, "0%"],
    [-0.4, "0%"],
    [1.7, "100%"],
    [0.25, "25%"],
  ])("fills a ranked bar with ratio %s as %s", (ratio, width) => {
    const { container } = render(<RankedBar label="Travel" amount="₹1" ratio={ratio} />);
    expect(container.querySelector<HTMLElement>("[style]")?.style.width).toBe(width);
  });

  it("ignores negative and non-finite split amounts in the shares", () => {
    const { rerender } = render(<SplitBar company={-100} pocket={500} format={(n) => `₹${n}`} />);
    expect(screen.getByRole("img", { name: "Company paid 0.0%, pocket 100.0%" })).toBeInTheDocument();

    rerender(<SplitBar company={Number.NaN} pocket={Number.POSITIVE_INFINITY} format={(n) => `₹${n}`} />);
    expect(screen.getByRole("img", { name: "Company paid 0.0%, pocket 0.0%" })).toBeInTheDocument();
    expect(screen.queryByText(/NaN|Infinity/)).not.toBeInTheDocument();
  });

  it.each([
    ["Software & Subscriptions", "sw"],
    ["Communication", "co"],
    ["Travel", "tr"],
    ["Training & Education", "ed"],
    ["Meals & Entertainment", "me"],
    ["Office Supplies", "of"],
    ["Marketing & Advertising", "mk"],
    ["Miscellaneous", "neutral"],
    [undefined, "neutral"],
  ])("maps %s to the %s colour family", (name, tone) => {
    expect(categoryTone(name)).toBe(tone);
  });

  it.each([
    ["Office Supplies", "of"],
    ["Travel", "tr"],
    ["Meals & Entertainment", "me"],
    ["Software & Subscriptions", "sw"],
    ["Equipment & Hardware", "of"],
    ["Marketing & Advertising", "mk"],
    ["Professional Services", "neutral"],
    ["Utilities", "neutral"],
    ["Rent & Facilities", "neutral"],
    ["Training & Education", "ed"],
    ["Communication", "co"],
    ["Insurance", "neutral"],
    ["Miscellaneous", "neutral"],
  ])("keeps the default category %s on %s", (name, tone) => {
    expect(categoryTone(name)).toBe(tone);
  });

  it.each([
    ["Hotel booking", "tr"],
    ["Flight bookings", "tr"],
    ["Facebook ads", "mk"],
    ["Notebooks", "of"],
    ["Headphones", "of"],
    ["Automobile", "tr"],
    ["Books", "ed"],
    ["Mobile phone", "co"],
    ["Cab rides", "tr"],
    ["Travelling allowance", "tr"],
  ])("matches whole words: %s is %s", (name, tone) => {
    expect(categoryTone(name)).toBe(tone);
  });

  it("keeps category glyphs decorative", () => {
    const { container } = render(<CategoryGlyph name="Travel" />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(container.firstElementChild?.className).toMatch(/bg-cat-tr-soft/);
  });
});

describe("primitive options", () => {
  it("shows a spinner and disables an icon button while loading", () => {
    render(<IconButton icon={Trash2} aria-label="Open receipt" loading />);
    const button = screen.getByRole("button", { name: "Open receipt" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });

  it("leaves a compound child alone when Field is given htmlFor", () => {
    render(
      <Field label="Destinations" htmlFor="dest">
        <div data-testid="box">
          <input id="dest" />
        </div>
      </Field>
    );
    expect(screen.getByTestId("box")).not.toHaveAttribute("id");
    expect(screen.getByLabelText("Destinations")).toHaveAttribute("id", "dest");
  });

  it("describes the panel under its title", () => {
    render(<Panel title="Who paid" description="Out-of-pocket spend is owed." />);
    expect(screen.getByRole("region", { name: "Who paid" })).toHaveTextContent("Out-of-pocket spend is owed.");
  });

  it("disables every segment", async () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        aria-label="Payment source"
        value="pocket"
        onChange={onChange}
        disabled
        options={[
          { value: "pocket", label: "Pocket" },
          { value: "company", label: "Company" },
        ]}
      />
    );
    expect(screen.getByRole("button", { name: "Company" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Company" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("uses aria-checked for radio chips and aria-pressed otherwise", () => {
    render(
      <div role="radiogroup" aria-label="Travel type">
        <Chip role="radio" pressed>
          Flight
        </Chip>
        <Chip pressed={false}>Stay</Chip>
      </div>
    );
    const radio = screen.getByRole("radio", { name: "Flight" });
    expect(radio).toHaveAttribute("aria-checked", "true");
    expect(radio).not.toHaveAttribute("aria-pressed");
    expect(screen.getByRole("button", { name: "Stay" })).toHaveAttribute("aria-pressed", "false");
  });

  it("removes a chip's value from the whole chip", async () => {
    const onRemove = vi.fn();
    render(
      <RemovableChip removeLabel="Remove Pune" onRemove={onRemove}>
        Pune
      </RemovableChip>
    );
    await userEvent.click(screen.getByRole("button", { name: "Remove Pune" }));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("clears a search box", async () => {
    const onValueChange = vi.fn();
    const { rerender } = render(<SearchInput aria-label="Search users" value="" onValueChange={onValueChange} />);
    expect(screen.queryByRole("button", { name: "Clear search" })).not.toBeInTheDocument();
    rerender(<SearchInput aria-label="Search users" value="asha" onValueChange={onValueChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(onValueChange).toHaveBeenCalledWith("");
  });

  it("keeps focus in the search box after Clear unmounts", async () => {
    function Controlled() {
      const [value, setValue] = useState("asha");
      return <SearchInput aria-label="Search users" value={value} onValueChange={setValue} />;
    }
    render(<Controlled />);
    await userEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.queryByRole("button", { name: "Clear search" })).not.toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search users" })).toHaveFocus();
  });
});

describe("Avatar", () => {
  it("takes initials from the first and last word", () => {
    expect(initials("Asha Rao")).toBe("AR");
    expect(initials("asha devi rao")).toBe("AR");
    expect(initials("Asha")).toBe("A");
    expect(initials("  ")).toBe("?");
    expect(initials(null)).toBe("?");
  });

  it("shows the photo when there is one, else initials", () => {
    const { container, rerender } = render(<Avatar name="Asha Rao" />);
    expect(container).toHaveTextContent("AR");
    rerender(<Avatar name="Asha Rao" photoURL="https://example.com/a.png" />);
    expect(container.querySelector("img")).toHaveAttribute("src", "https://example.com/a.png");
  });
});
