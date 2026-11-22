import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import ExpenseDetailPanel from "./ExpenseDetailPanel";
import { DETAIL_PANEL_MIN, DETAIL_PANEL_PREFERRED, DETAIL_PANEL_WIDTH_KEY } from "./detail-panel";

function renderPanel() {
  return render(
    <ExpenseDetailPanel id="expense-detail-panel">
      <p>Receipt preview</p>
    </ExpenseDetailPanel>
  );
}

function separator() {
  return screen.getByRole("separator", { name: "Resize expense details" });
}

describe("ExpenseDetailPanel", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts at the preferred width and remembers a drag", () => {
    renderPanel();
    const handle = separator();
    expect(handle).toHaveAttribute("aria-orientation", "vertical");
    expect(handle).toHaveAttribute("aria-valuenow", String(DETAIL_PANEL_PREFERRED));
    expect(handle).toHaveAttribute("aria-valuemin", String(DETAIL_PANEL_MIN));
    expect(screen.getByRole("complementary", { name: "Selected expense" })).toHaveStyle({
      width: `${DETAIL_PANEL_PREFERRED}px`,
    });

    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 500 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 420 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 420 });

    // Dragging the handle left (the panel is on the right) widens it.
    expect(handle).toHaveAttribute("aria-valuenow", String(DETAIL_PANEL_PREFERRED + 80));
    expect(localStorage.getItem(DETAIL_PANEL_WIDTH_KEY)).toBe(String(DETAIL_PANEL_PREFERRED + 80));
  });

  it("does not lock the width when the handle is only clicked", () => {
    renderPanel();
    const handle = separator();
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 500 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 500 });
    expect(localStorage.getItem(DETAIL_PANEL_WIDTH_KEY)).toBeNull();
    expect(handle).toHaveAttribute("aria-valuenow", String(DETAIL_PANEL_PREFERRED));
  });

  it("nudges from the keyboard and double-click restores the default", () => {
    renderPanel();
    const handle = separator();

    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(handle).toHaveAttribute("aria-valuenow", String(DETAIL_PANEL_PREFERRED + 24));

    fireEvent.keyDown(handle, { key: "ArrowRight", shiftKey: true });
    expect(handle).toHaveAttribute("aria-valuenow", String(DETAIL_PANEL_PREFERRED + 24 - 80));

    fireEvent.keyDown(handle, { key: "Home" });
    expect(handle).toHaveAttribute("aria-valuenow", String(DETAIL_PANEL_MIN));

    fireEvent.keyDown(handle, { key: "End" });
    expect(handle).toHaveAttribute("aria-valuenow", "960");

    fireEvent.doubleClick(handle);
    expect(localStorage.getItem(DETAIL_PANEL_WIDTH_KEY)).toBeNull();
    expect(handle).toHaveAttribute("aria-valuenow", String(DETAIL_PANEL_PREFERRED));
  });

  it("restores the saved width", () => {
    localStorage.setItem(DETAIL_PANEL_WIDTH_KEY, "720");
    renderPanel();
    expect(separator()).toHaveAttribute("aria-valuenow", "720");
    expect(screen.getByRole("complementary", { name: "Selected expense" })).toHaveStyle({ width: "720px" });
  });

  it("ignores a stored value that isn't a width", () => {
    localStorage.setItem(DETAIL_PANEL_WIDTH_KEY, "wide");
    renderPanel();
    expect(separator()).toHaveAttribute("aria-valuenow", String(DETAIL_PANEL_PREFERRED));
  });
});
