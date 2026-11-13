"use client";

import { useEffect, useRef, type RefObject } from "react";

interface Layer {
  container: RefObject<HTMLElement | null>;
}

/**
 * Open layers (dialogs, drawers, the palette), bottom first. Only the last one
 * handles keys. A layer rendered inside another sits above it, even when both
 * open in the same commit (child effects run first).
 */
const layers: Layer[] = [];

function pushLayer(layer: Layer) {
  const el = layer.container.current;
  const nestedIndex = el ? layers.findIndex((l) => l.container.current && el.contains(l.container.current)) : -1;
  if (nestedIndex === -1) layers.push(layer);
  else layers.splice(nestedIndex, 0, layer);
}

const isTopmost = (layer: Layer) => layers[layers.length - 1] === layer;

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function focusableIn(container: HTMLElement): HTMLElement[] {
  const all = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
  // Skip elements that aren't rendered (display: none); where layout isn't
  // computed at all (jsdom) every element reports no boxes, so keep them all.
  const rendered = all.filter((el) => el.getClientRects().length > 0);
  return rendered.length > 0 ? rendered : all;
}

/** Keeps Tab / Shift+Tab inside `container`. */
function trapTab(e: KeyboardEvent, container: HTMLElement) {
  const items = focusableIn(container);
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

interface DialogLayerOptions {
  /** Element focused on open; default the container (give it tabIndex={-1}). */
  initialFocus?: RefObject<HTMLElement | null>;
}

/**
 * Modal layer behaviour for a dialog, drawer or palette while `open`:
 * moves focus in, traps Tab inside `containerRef`, closes on Escape only when
 * it is the topmost open layer, and returns focus to the opener on close.
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
    const layer: Layer = { container: containerRef };
    pushLayer(layer);
    const opener = openerRef.current;
    // Leave focus alone if a child already took it (an `autoFocus` field).
    const focused = document.activeElement;
    const focusedInside = focused instanceof Node && !!containerRef.current?.contains(focused);
    if (isTopmost(layer) && !focusedInside) (initialFocus?.current ?? containerRef.current)?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isTopmost(layer)) return;
      if (e.key === "Escape") {
        onCloseRef.current();
      } else if (e.key === "Tab" && containerRef.current) {
        trapTab(e, containerRef.current);
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      layers.splice(layers.indexOf(layer), 1);
      if (opener?.isConnected && opener !== document.body) opener.focus();
    };
    // Refs are stable; the layer lives exactly as long as `open` is true.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}
