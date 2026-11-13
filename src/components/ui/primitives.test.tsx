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
