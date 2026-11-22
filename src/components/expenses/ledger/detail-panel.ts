/**
 * Width of the expense detail side panel.
 *
 * The ledger used to keep almost all leftover space and the panel sat on a
 * 340px basis, so a receipt was a narrow strip on a laptop. The panel now has
 * an explicit width: a readable default, whatever the user dragged it to, and
 * a clamp that leaves the ledger a usable minimum.
 */

/** Narrowest the panel can be dragged. */
export const DETAIL_PANEL_MIN = 360;
/** Preferred width: wide enough to read a receipt, when the row allows it. */
export const DETAIL_PANEL_PREFERRED = 640;
/** Ledger width kept while dragging, so the list never collapses away. */
export const DETAIL_LEDGER_MIN = 280;
/** `gap-5` between the ledger and the panel. */
export const DETAIL_PANEL_GAP = 20;
/** localStorage key for the dragged width. */
export const DETAIL_PANEL_WIDTH_KEY = "expense-detail-width";
/** Ceiling before the row has been measured (SSR and tests). */
export const DETAIL_PANEL_MAX_FALLBACK = 960;
/** Arrow keys nudge by this many pixels; Shift uses the larger step. */
export const DETAIL_PANEL_KEY_STEP = 24;
export const DETAIL_PANEL_KEY_STEP_LARGE = 80;

/** Widest the panel may be for a row of `containerWidth` pixels (0 when unknown). */
export function detailPanelMax(containerWidth: number): number {
  if (!(containerWidth > 0)) return DETAIL_PANEL_MAX_FALLBACK;
  return Math.max(DETAIL_PANEL_MIN, containerWidth - DETAIL_LEDGER_MIN - DETAIL_PANEL_GAP);
}

/** `width` clamped into the panel's min and the row's max. Non-finite becomes the min. */
export function clampDetailPanelWidth(width: number, containerWidth: number): number {
  const max = detailPanelMax(containerWidth);
  if (!Number.isFinite(width)) return Math.min(DETAIL_PANEL_MIN, max);
  return Math.round(Math.min(max, Math.max(DETAIL_PANEL_MIN, width)));
}

/**
 * Width before the user has dragged. At least the preferred width, and half
 * the row when that is wider, but never so wide the ledger loses its minimum.
 */
export function defaultDetailPanelWidth(containerWidth: number): number {
  if (!(containerWidth > 0)) return DETAIL_PANEL_PREFERRED;
  const half = Math.round((containerWidth - DETAIL_PANEL_GAP) / 2);
  return clampDetailPanelWidth(Math.max(DETAIL_PANEL_PREFERRED, half), containerWidth);
}
