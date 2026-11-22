import { describe, expect, it } from "vitest";
import {
  DETAIL_PANEL_MAX_FALLBACK,
  DETAIL_PANEL_MIN,
  DETAIL_PANEL_PREFERRED,
  clampDetailPanelWidth,
  defaultDetailPanelWidth,
  detailPanelMax,
} from "./detail-panel";

describe("detail panel width", () => {
  it("caps the panel so the ledger keeps its minimum", () => {
    expect(detailPanelMax(1200)).toBe(900);
    expect(detailPanelMax(640)).toBe(DETAIL_PANEL_MIN);
    expect(detailPanelMax(0)).toBe(DETAIL_PANEL_MAX_FALLBACK);
  });

  it("clamps a dragged width into range", () => {
    expect(clampDetailPanelWidth(100, 1200)).toBe(DETAIL_PANEL_MIN);
    expect(clampDetailPanelWidth(500, 1200)).toBe(500);
    expect(clampDetailPanelWidth(500.6, 1200)).toBe(501);
    expect(clampDetailPanelWidth(2000, 1200)).toBe(900);
    expect(clampDetailPanelWidth(Number.NaN, 1200)).toBe(DETAIL_PANEL_MIN);
  });

  it("starts wide enough to read a receipt, and wider on a large row", () => {
    expect(defaultDetailPanelWidth(0)).toBe(DETAIL_PANEL_PREFERRED);
    // Half of a 1600px row is more than the preferred width.
    expect(defaultDetailPanelWidth(1600)).toBe(790);
    // A laptop row keeps the preferred width while the list still fits.
    expect(defaultDetailPanelWidth(1100)).toBe(DETAIL_PANEL_PREFERRED);
  });

  it("shrinks toward the minimum when the row cannot hold the preferred width", () => {
    expect(defaultDetailPanelWidth(900)).toBe(600);
    expect(defaultDetailPanelWidth(700)).toBe(400);
  });
});
