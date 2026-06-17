import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MultiSelect from "@/components/ui/MultiSelect";

const OPTIONS = [
  { value: "a", label: "Apple" },
  { value: "b", label: "Banana" },
  { value: "c", label: "Cherry" },
];

function renderMultiSelect(props: Partial<React.ComponentProps<typeof MultiSelect>> = {}) {
  const onChange = vi.fn();
  const utils = render(
    <MultiSelect
      options={OPTIONS}
      selected={[]}
      onChange={onChange}
      placeholder="Pick fruit"
      {...props}
    />
  );
  return { onChange, ...utils };
}

describe("MultiSelect", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("is closed by default (no options popover rendered)", () => {
    renderMultiSelect();
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("opens the popover when the trigger is clicked and closes on a second click", async () => {
    const user = userEvent.setup();
    renderMultiSelect();
    const trigger = screen.getByRole("button", { name: /pick fruit/i });

    await user.click(trigger);
    expect(screen.getAllByRole("option")).toHaveLength(3);

    await user.click(trigger);
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("shows the placeholder when nothing is selected", () => {
    renderMultiSelect();
    expect(screen.getByRole("button", { name: /pick fruit/i })).toHaveTextContent("Pick fruit");
  });

  it("shows the single option label when exactly one is selected", () => {
    renderMultiSelect({ selected: ["b"] });
    expect(screen.getByRole("button")).toHaveTextContent("Banana");
  });

  it('shows "N selected" when two or more are selected', () => {
    renderMultiSelect({ selected: ["a", "c"] });
    expect(screen.getByRole("button")).toHaveTextContent("2 selected");
  });

  it("calls onChange with the value added when clicking an unselected option", async () => {
    const user = userEvent.setup();
    const { onChange } = renderMultiSelect({ selected: ["a"] });

    await user.click(screen.getByRole("button", { name: "Apple" }));
    await user.click(screen.getByRole("option", { name: "Banana" }));

    expect(onChange).toHaveBeenCalledWith(["a", "b"]);
  });

  it("calls onChange with the value removed when clicking a selected option (toggle)", async () => {
    const user = userEvent.setup();
    const { onChange } = renderMultiSelect({ selected: ["a", "b"] });

    await user.click(screen.getByRole("button"));
    await user.click(screen.getByRole("option", { name: "Apple" }));

    expect(onChange).toHaveBeenCalledWith(["b"]);
  });

  it("reflects the new selection after re-render with updated props", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <MultiSelect options={OPTIONS} selected={[]} onChange={onChange} placeholder="Pick fruit" />
    );
    // The trigger's accessible name is derived from its summary text, which
    // changes with selection, so target it by its stable aria-haspopup attribute.
    const trigger = () =>
      screen.getAllByRole("button").find((b) => b.getAttribute("aria-haspopup") === "listbox")!;

    await user.click(trigger());
    expect(trigger()).toHaveTextContent("Pick fruit");

    rerender(
      <MultiSelect options={OPTIONS} selected={["c"]} onChange={onChange} placeholder="Pick fruit" />
    );
    // After selecting one, summary shows that option's label.
    expect(trigger()).toHaveTextContent("Cherry");
  });

  it('shows "Clear selection" only when something is selected and calls onChange([])', async () => {
    const user = userEvent.setup();
    const { onChange, rerender } = renderMultiSelect({ selected: [] });

    await user.click(screen.getByRole("button", { name: /pick fruit/i }));
    expect(screen.queryByRole("button", { name: /clear selection/i })).not.toBeInTheDocument();

    rerender(
      <MultiSelect options={OPTIONS} selected={["a"]} onChange={onChange} placeholder="Pick fruit" />
    );
    const clear = screen.getByRole("button", { name: /clear selection/i });
    expect(clear).toBeInTheDocument();

    await user.click(clear);
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('shows "No options" when the options list is empty', async () => {
    const user = userEvent.setup();
    renderMultiSelect({ options: [] });

    await user.click(screen.getByRole("button", { name: /pick fruit/i }));
    expect(screen.getByText("No options")).toBeInTheDocument();
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("marks selected options with aria-selected=true and a check indicator", async () => {
    const user = userEvent.setup();
    renderMultiSelect({ selected: ["b"] });

    await user.click(screen.getByRole("button"));
    const options = screen.getAllByRole("option");
    const selectedOption = options.find((o) => o.textContent?.includes("Banana"))!;
    const unselectedOption = options.find((o) => o.textContent?.includes("Apple"))!;

    expect(selectedOption).toHaveAttribute("aria-selected", "true");
    expect(unselectedOption).toHaveAttribute("aria-selected", "false");
    // The check icon (lucide adds the lucide-check class) only renders for selected.
    expect(selectedOption.querySelector(".lucide-check")).toBeTruthy();
    expect(unselectedOption.querySelector(".lucide-check")).toBeFalsy();
  });

  it("closes the popover on click outside", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <MultiSelect options={OPTIONS} selected={[]} onChange={vi.fn()} placeholder="Pick fruit" />
        <button>outside</button>
      </div>
    );

    await user.click(screen.getByRole("button", { name: /pick fruit/i }));
    expect(screen.getAllByRole("option")).toHaveLength(3);

    await user.click(screen.getByRole("button", { name: "outside" }));
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("closes the popover when Escape is pressed", async () => {
    const user = userEvent.setup();
    renderMultiSelect();

    await user.click(screen.getByRole("button", { name: /pick fruit/i }));
    expect(screen.getAllByRole("option")).toHaveLength(3);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("applies ariaLabel to the trigger and reflects open state via aria-expanded", async () => {
    const user = userEvent.setup();
    renderMultiSelect({ ariaLabel: "Filter by fruit" });
    const trigger = screen.getByRole("button", { name: "Filter by fruit" });

    expect(trigger).toHaveAttribute("aria-haspopup", "listbox");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });
});
