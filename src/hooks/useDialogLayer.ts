"use client";

import { useEffect, useRef, type RefObject } from "react";

interface Layer {
  container: RefObject<HTMLElement | null>;
  close: () => void;
  /** Where focus lands when a layer above this one closes and its opener is gone. */
  focusTarget: () => HTMLElement | null;
}

/**
 * Open layers (dialogs, drawers, the palette), bottom first. One document
 * listener routes keys to the last one only, so a single Escape closes only
 * the topmost thing. A layer rendered inside another sits above it, even when
 * both open in the same commit (child effects run first).
 */
const layers: Layer[] = [];

function pushLayer(layer: Layer) {
  const el = layer.container.current;
  const nestedIndex = el ? layers.findIndex((l) => l.container.current && el.contains(l.container.current)) : -1;
  if (nestedIndex === -1) layers.push(layer);
  else layers.splice(nestedIndex, 0, layer);
  document.addEventListener("keydown", handleKeyDown);
}

function removeLayer(layer: Layer) {
  const index = layers.indexOf(layer);
  if (index !== -1) layers.splice(index, 1);
  if (layers.length === 0) document.removeEventListener("keydown", handleKeyDown);
}

const topLayer = (): Layer | undefined => layers[layers.length - 1];

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]",
].join(",");

/** False where layout isn't computed at all (jsdom): every element reports no boxes there. */
const hasLayout = () => document.documentElement.getClientRects().length > 0;

/** Whether `el` has a box (not display: none); always true where layout isn't computed. */
const isRendered = (el: Element, layout = hasLayout()) => !layout || el.getClientRects().length > 0;

/** Keeps Tab / Shift+Tab inside `container`, over its rendered tabbable elements (tabindex="-1" skipped). */
function trapTab(e: KeyboardEvent, container: HTMLElement) {
  const layout = hasLayout();
  const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.getAttribute("tabindex") !== "-1" && isRendered(el, layout)
  );
  if (items.length === 0) {
    e.preventDefault();
    container.focus();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  const inside = active instanceof Node && container.contains(active);
  if (e.shiftKey && (!inside || active === first || active === container)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (!inside || active === last)) {
    e.preventDefault();
    first.focus();
  }
}

function handleKeyDown(e: KeyboardEvent) {
  const top = topLayer();
  if (!top) return;
  // A control inside that handled Escape itself (an open MultiSelect menu) prevented it.
  if (e.key === "Escape" && !e.defaultPrevented) top.close();
  else if (e.key === "Tab" && top.container.current) trapTab(e, top.container.current);
}

const focusLost = () => {
  const active = document.activeElement;
  return !active || active === document.body || !active.isConnected;
};

interface DialogLayerOptions {
  /** Element focused on open; default the container (give it tabIndex={-1}). */
  initialFocus?: RefObject<HTMLElement | null>;
}

/**
 * Modal layer behaviour for a dialog, drawer or palette while `open`:
 * moves focus in, traps Tab inside `containerRef`, closes on Escape only when
 * it is the topmost open layer, and returns focus to the opener on close (or,
 * if the opener is gone, to the layer below or #main). The page scroller is
 * locked by CSS while any `aria-modal="true"` element is mounted (globals.css).
 */
export function useDialogLayer(
  open: boolean,
  containerRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  { initialFocus }: DialogLayerOptions = {}
) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Remember the opener during the render that opens the layer: by the time
  // effects run, an `autoFocus` field inside may already have taken focus.
  const openerRef = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  if (open && !wasOpen.current && typeof document !== "undefined") {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }
  wasOpen.current = open;

  useEffect(() => {
    if (!open) return;
    const layer: Layer = {
      container: containerRef,
      close: () => onCloseRef.current(),
      focusTarget: () => initialFocus?.current ?? containerRef.current,
    };
    pushLayer(layer);

    // Leave focus alone if a child already took it (an `autoFocus` field).
    const focused = document.activeElement;
    const focusedInside = focused instanceof Node && !!containerRef.current?.contains(focused);
    if (topLayer() === layer && !focusedInside) layer.focusTarget()?.focus();

    return () => {
      removeLayer(layer);
      const target = openerRef.current;
      if (target && target.isConnected && isRendered(target) && target !== document.body) {
        target.focus();
      } else if (focusLost()) {
        // The opener is gone (its row was deleted) or hidden (the drawer's "More"
        // button from lg up): stay in the layer below, or the page.
        const fallback = topLayer()?.focusTarget() ?? document.getElementById("main");
        fallback?.focus({ preventScroll: true });
      }
    };
    // Refs are stable; the layer lives exactly as long as `open` is true.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}
