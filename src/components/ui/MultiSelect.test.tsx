import { useState } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MultiSelect from "@/components/ui/MultiSelect";
import Modal from "@/components/ui/Modal";

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
    vi.restoreAllMocks();
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

  it('shows a disabled "None available" trigger when the options list is empty', async () => {
    const user = userEvent.setup();
    renderMultiSelect({ options: [], placeholder: "All 0" });

    const trigger = screen.getByRole("button", { name: "None available" });
    expect(trigger).toBeDisabled();
    expect(trigger).not.toHaveTextContent("All 0");
    await user.click(trigger);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("keeps the placeholder while an empty list is still loading", () => {
    renderMultiSelect({ options: [], loading: true, placeholder: "Loading people..." });
    expect(screen.getByRole("button", { name: "Loading people..." })).toBeDisabled();
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

  it("keeps Escape from also reaching an enclosing modal while open", async () => {
    const user = userEvent.setup();
    const onModalClose = vi.fn();
    render(
      <Modal isOpen onClose={onModalClose} title="Trip">
        <MultiSelect options={OPTIONS} selected={[]} onChange={vi.fn()} placeholder="Pick fruit" />
      </Modal>
    );

    await user.click(screen.getByRole("button", { name: /pick fruit/i }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(onModalClose).not.toHaveBeenCalled();

    // Closed again, Escape is the modal's.
    await user.keyboard("{Escape}");
    expect(onModalClose).toHaveBeenCalledTimes(1);
  });

  it("lets a layer opened over the open menu take Escape first", async () => {
    const user = userEvent.setup();
    const closePalette = vi.fn();
    const ui = (paletteOpen: boolean) => (
      <>
        <MultiSelect options={OPTIONS} selected={[]} onChange={vi.fn()} placeholder="Pick fruit" />
        <Modal isOpen={paletteOpen} onClose={closePalette} title="Command palette">
          <input aria-label="Search commands" />
        </Modal>
      </>
    );
    const { rerender } = render(ui(false));
    await user.click(screen.getByRole("button", { name: /pick fruit/i }));
    rerender(ui(true));

    await user.keyboard("{Escape}");
    expect(closePalette).toHaveBeenCalledTimes(1);
    // One Escape, one layer: the menu underneath is still open.
    expect(screen.getAllByRole("option", { hidden: true })).toHaveLength(3);

    rerender(ui(false));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("option", { hidden: true })).not.toBeInTheDocument();
    expect(closePalette).toHaveBeenCalledTimes(1);
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

  it("renders the options popover in a high-layer portal", async () => {
    const user = userEvent.setup();
    const { container } = renderMultiSelect();

    await user.click(screen.getByRole("button", { name: /pick fruit/i }));

    // The popover holds "Clear selection" and the listbox (only options inside it).
    const popover = screen.getByRole("listbox").parentElement!;
    expect(popover.parentElement).toBe(document.body);
    expect(popover).toHaveClass("fixed");
    expect(popover.className).toMatch(/z-\[(?:[5-9]\d|[1-9]\d{2,})\]|z-(?:5[0-9]|[6-9][0-9])/);
    expect(container).not.toContainElement(popover);
  });

  it("keeps the portaled popover within a short viewport", async () => {
    const user = userEvent.setup();
    const { container } = renderMultiSelect();
    const triggerWrapper = container.querySelector(".relative") as HTMLDivElement;
    vi.spyOn(triggerWrapper, "getBoundingClientRect").mockReturnValue({
      top: 40,
      bottom: 70,
      left: 24,
      right: 224,
      width: 200,
      height: 30,
      x: 24,
      y: 40,
      toJSON: () => ({}),
    } as DOMRect);
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(120);

    await user.click(screen.getByRole("button", { name: /pick fruit/i }));

    const popover = screen.getByRole("listbox").parentElement!;
    const top = Number.parseFloat(popover.style.top);
    const maxHeight = Number.parseFloat(popover.style.maxHeight);
    expect(top).toBeGreaterThanOrEqual(12);
    expect(top + maxHeight).toBeLessThanOrEqual(108);
  });

  it("is at least 16rem wide, stays on screen and wraps long labels", async () => {
    const user = userEvent.setup();
    const { container } = renderMultiSelect({
      options: [{ value: "sw", label: "Software & Subscriptions" }],
    });
    const triggerWrapper = container.querySelector(".relative") as HTMLDivElement;
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(768);
    vi.spyOn(triggerWrapper, "getBoundingClientRect").mockReturnValue({
      top: 40, bottom: 84, left: 640, right: 750, width: 110, height: 44, x: 640, y: 40, toJSON: () => ({}),
    } as DOMRect);

    await user.click(screen.getByRole("button", { name: /pick fruit/i }));
    const popover = screen.getByRole("listbox").parentElement!;
    expect(Number.parseFloat(popover.style.width)).toBe(256);
    // Pulled left so its right edge keeps the 16px gutter: 768 - 16 - 256.
    expect(Number.parseFloat(popover.style.left)).toBe(496);
    const label = screen.getByText("Software & Subscriptions");
    expect(label).not.toHaveClass("truncate");
    expect(label).toHaveClass("break-words");
  });

  it("never grows wider than the viewport minus its gutters", async () => {
    const user = userEvent.setup();
    const { container } = renderMultiSelect();
    const triggerWrapper = container.querySelector(".relative") as HTMLDivElement;
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(240);
    vi.spyOn(triggerWrapper, "getBoundingClientRect").mockReturnValue({
      top: 40, bottom: 84, left: 16, right: 224, width: 208, height: 44, x: 16, y: 40, toJSON: () => ({}),
    } as DOMRect);

    await user.click(screen.getByRole("button", { name: /pick fruit/i }));
    const popover = screen.getByRole("listbox").parentElement!;
    expect(Number.parseFloat(popover.style.width)).toBe(208);
    expect(Number.parseFloat(popover.style.left)).toBe(16);
  });

  it("names the listbox with listLabel, falling back to ariaLabel then the placeholder", async () => {
    const user = userEvent.setup();
    const { unmount } = renderMultiSelect({ listLabel: "Departments", placeholder: "All 3" });
    await user.click(screen.getByRole("button", { name: "All 3" }));
    expect(screen.getByRole("listbox", { name: "Departments" })).toHaveAttribute("aria-multiselectable", "true");
    unmount();

    renderMultiSelect({ ariaLabel: "Fruit" });
    await user.click(screen.getByRole("button", { name: "Fruit" }));
    expect(screen.getByRole("listbox", { name: "Fruit" })).toBeInTheDocument();
  });

  it("points the trigger at its listbox while open", async () => {
    const user = userEvent.setup();
    renderMultiSelect();
    const trigger = screen.getByRole("button", { name: /pick fruit/i });
    expect(trigger).not.toHaveAttribute("aria-controls");
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-controls", screen.getByRole("listbox").id);
  });

  describe("keyboard", () => {
    it("opens with ArrowDown into the first option, moves with arrows and toggles with Space / Enter", async () => {
      const user = userEvent.setup();
      const { onChange } = renderMultiSelect();
      screen.getByRole("button", { name: /pick fruit/i }).focus();

      await user.keyboard("{ArrowDown}");
      expect(screen.getByRole("option", { name: "Apple" })).toHaveFocus();
      await user.keyboard("{ArrowDown}");
      expect(screen.getByRole("option", { name: "Banana" })).toHaveFocus();
      await user.keyboard(" ");
      expect(onChange).toHaveBeenLastCalledWith(["b"]);
      await user.keyboard("{End}");
      expect(screen.getByRole("option", { name: "Cherry" })).toHaveFocus();
      await user.keyboard("{ArrowDown}");
      expect(screen.getByRole("option", { name: "Cherry" })).toHaveFocus();
      await user.keyboard("{Enter}");
      expect(onChange).toHaveBeenLastCalledWith(["c"]);
      await user.keyboard("{Home}{ArrowUp}");
      expect(screen.getByRole("option", { name: "Apple" })).toHaveFocus();
    });

    it.each(["{Enter}", " "])("opens with %j into the first option", async (key) => {
      const user = userEvent.setup();
      renderMultiSelect();
      screen.getByRole("button", { name: /pick fruit/i }).focus();

      await user.keyboard(key);
      expect(screen.getByRole("option", { name: "Apple" })).toHaveFocus();
    });

    it("opens with ArrowUp into the last option", async () => {
      const user = userEvent.setup();
      renderMultiSelect();
      screen.getByRole("button", { name: /pick fruit/i }).focus();

      await user.keyboard("{ArrowUp}");
      expect(screen.getByRole("option", { name: "Cherry" })).toHaveFocus();
    });

    it("does not move focus when opened with the mouse", async () => {
      const user = userEvent.setup();
      renderMultiSelect();
      const trigger = screen.getByRole("button", { name: /pick fruit/i });

      await user.click(trigger);
      expect(trigger).toHaveFocus();
      await user.keyboard("{ArrowDown}");
      expect(screen.getByRole("option", { name: "Apple" })).toHaveFocus();
    });

    it("closes on Escape and returns focus to the trigger", async () => {
      const user = userEvent.setup();
      renderMultiSelect();
      const trigger = screen.getByRole("button", { name: /pick fruit/i });
      trigger.focus();

      await user.keyboard("{ArrowDown}{ArrowDown}{Escape}");
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });

    it("closes on Tab and moves on from the trigger", async () => {
      const user = userEvent.setup();
      render(
        <>
          <button>Before</button>
          <MultiSelect options={OPTIONS} selected={[]} onChange={vi.fn()} placeholder="Pick fruit" />
          <button>After</button>
        </>
      );
      screen.getByRole("button", { name: /pick fruit/i }).focus();

      await user.keyboard("{ArrowDown}");
      await user.tab();
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "After" })).toHaveFocus();

      screen.getByRole("button", { name: /pick fruit/i }).focus();
      await user.keyboard("{ArrowDown}");
      await user.tab({ shift: true });
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Before" })).toHaveFocus();
    });
  });

  describe("inside a Modal", () => {
    function TripForm({ last = false }: { last?: boolean }) {
      const [travelers, setTravelers] = useState<string[]>([]);
      const select = (
        <MultiSelect
          options={[
            { value: "p", label: "Priya" },
            { value: "r", label: "Ravi" },
          ]}
          selected={travelers}
          onChange={setTravelers}
          placeholder="Who's travelling?"
          ariaLabel="Travelers"
        />
      );
      return (
        <>
          <button>Outside</button>
          <Modal isOpen onClose={() => {}} title="Trip">
            <input aria-label="Name" />
            {select}
            {!last && <button>Save</button>}
          </Modal>
        </>
      );
    }

    it("portals the menu inside the aria-modal dialog, not body", async () => {
      const user = userEvent.setup();
      render(<TripForm />);
      await user.click(screen.getByRole("button", { name: "Travelers" }));
      const dialog = screen.getByRole("dialog", { name: "Trip" });
      expect(dialog).toContainElement(screen.getByRole("listbox"));
    });

    it("lets the keyboard select an option of a portalled menu", async () => {
      const user = userEvent.setup();
      render(<TripForm />);
      screen.getByLabelText("Name").focus();

      await user.tab();
      const trigger = screen.getByRole("button", { name: "Travelers" });
      expect(trigger).toHaveFocus();
      await user.keyboard("{Enter}");
      expect(screen.getByRole("option", { name: "Priya" })).toHaveFocus();
      await user.keyboard("{ArrowDown}{Enter}");
      expect(screen.getByRole("option", { name: "Ravi" })).toHaveAttribute("aria-selected", "true");
      expect(trigger).toHaveTextContent("Ravi");
      // Still open (multi-select), and the Modal is still there.
      expect(screen.getByRole("listbox", { name: "Travelers" })).toBeInTheDocument();
      expect(screen.getByRole("dialog", { name: "Trip" })).toBeInTheDocument();
    });

    it("tabs from the menu to the next field in the dialog, not out of it", async () => {
      const user = userEvent.setup();
      render(<TripForm />);
      screen.getByRole("button", { name: "Travelers" }).focus();

      await user.keyboard("{ArrowDown}");
      await user.tab();
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Save" })).toHaveFocus();
    });

    it("wraps inside the dialog when the select is its last field", async () => {
      const user = userEvent.setup();
      render(<TripForm last />);
      screen.getByRole("button", { name: "Travelers" }).focus();

      await user.keyboard("{ArrowDown}");
      await user.tab();
      expect(screen.getByRole("button", { name: "Close dialog" })).toHaveFocus();
      expect(screen.getByRole("button", { name: "Outside" })).not.toHaveFocus();
    });
  });
});
