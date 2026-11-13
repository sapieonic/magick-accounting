"use client";

import { useEffect, useRef, type RefObject } from "react";

interface Layer {
  container: RefObject<HTMLElement | null>;
  /** A popup (menu, listbox) inside another layer: Tab closes it and moves on instead of being trapped. */
  popup: boolean;
  close: () => void;
  /** Where focus goes back to: the opener (or the popup's trigger). */
  anchor: () => HTMLElement | null;
  /** Where focus lands when a layer above this one closes and its opener is gone. */
  focusTarget: () => HTMLElement | null;
}

/**
 * Open layers (dialogs, drawers, the palette, popup menus), bottom first. One
 * document listener routes keys to the last one only, so a single Escape
 * closes only the topmost thing. A layer rendered inside another sits above
 * it, even when both open in the same commit (child effects run first).
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

/** Tabbable elements in DOM order; skips tabindex="-1" and, where layout exists, unrendered ones (display: none). */
function focusableIn(container: HTMLElement): HTMLElement[] {
  const all = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.getAttribute("tabindex") !== "-1"
  );
  return hasLayout() ? all.filter((el) => el.getClientRects().length > 0) : all;
}

/** Keeps Tab / Shift+Tab inside `container`. */
function trapTab(e: KeyboardEvent, container: HTMLElement) {
  // A layer that isn't rendered (e.g. the drawer hidden at lg) must not swallow Tab.
  if (hasLayout() && container.getClientRects().length === 0) return;
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

/**
 * Tab in a popup: close it and move on from its trigger, as if the popup had
 * never taken focus, staying inside the layer below (wrapping there) if any.
 */
function tabOutOfPopup(e: KeyboardEvent, popup: Layer) {
  const anchor = popup.anchor();
  popup.close();
  if (!anchor?.isConnected) return;
  const below = layers.slice(0, layers.indexOf(popup)).reverse().find((l) => !l.popup);
  const scope = below?.container.current ?? document.body;
  const items = focusableIn(scope);
  const index = items.indexOf(anchor);
  anchor.focus();
  if (index === -1) return;
  let next: HTMLElement | undefined = items[index + (e.shiftKey ? -1 : 1)];
  if (!next && below) next = e.shiftKey ? items[items.length - 1] : items[0];
  // Past the page's last element, leave the default (out to the browser) from the trigger.
  if (!next) return;
  e.preventDefault();
  next.focus();
}

function handleKeyDown(e: KeyboardEvent) {
  const top = topLayer();
  if (!top) return;
  if (e.key === "Escape") {
    top.close();
  } else if (e.key === "Tab") {
    if (top.popup) tabOutOfPopup(e, top);
    else if (top.container.current) trapTab(e, top.container.current);
  }
}

/*
 * Scroll lock for the page scroller (<main id="main"> in the dashboard shell,
 * the body elsewhere), ref-counted so a nested layer closing doesn't unlock
 * while another is still open.
 */
let lockCount = 0;
let lockedScroller: { el: HTMLElement; overflow: string; gutter: string } | null = null;

function lockScroll(): () => void {
  if (lockCount++ === 0) {
    const el = document.getElementById("main") ?? document.body;
    // Keep the content width when the scrollbar disappears (a gutter, not
    // padding: padding on the scroller would shift its sticky children).
    const hasScrollbar = el.offsetWidth - el.clientWidth > 0;
    lockedScroller = { el, overflow: el.style.overflow, gutter: el.style.getPropertyValue("scrollbar-gutter") };
    el.style.overflow = "hidden";
    if (hasScrollbar) el.style.setProperty("scrollbar-gutter", "stable");
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--lockCount === 0 && lockedScroller) {
      lockedScroller.el.style.overflow = lockedScroller.overflow;
      lockedScroller.el.style.setProperty("scrollbar-gutter", lockedScroller.gutter);
      lockedScroller = null;
    }
  };
}

const focusLost = () => {
  const active = document.activeElement;
  return !active || active === document.body || !active.isConnected;
};

interface DialogLayerOptions {
  /** Element focused on open; default the container (give it tabIndex={-1}). */
  initialFocus?: RefObject<HTMLElement | null>;
  /**
   * A popup menu/listbox owned by a control (MultiSelect): it doesn't take
   * focus on open, lock scrolling or trap Tab; Tab closes it and moves on from
   * `returnFocus`, and focus goes back there on close only if it was inside.
   */
  popup?: boolean;
  /** Where focus returns on close; default the element focused when it opened. */
  returnFocus?: RefObject<HTMLElement | null>;
}

/**
 * Modal layer behaviour for a dialog, drawer or palette while `open`:
 * moves focus in, traps Tab inside `containerRef`, locks the page scroller,
 * closes on Escape only when it is the topmost open layer, and returns focus
 * to the opener on close (or, if the opener is gone, to the layer below or
 * #main). With `popup`, the lighter behaviour of a menu inside such a layer.
 */
export function useDialogLayer(
  open: boolean,
  containerRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  { initialFocus, popup = false, returnFocus }: DialogLayerOptions = {}
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
    const opener = () => returnFocus?.current ?? openerRef.current;
    const layer: Layer = {
      container: containerRef,
      popup,
      close: () => onCloseRef.current(),
      anchor: opener,
      focusTarget: () => (popup ? opener() : (initialFocus?.current ?? containerRef.current)),
    };
    pushLayer(layer);

    let unlockScroll: (() => void) | undefined;
    if (!popup) {
      unlockScroll = lockScroll();
      // Leave focus alone if a child already took it (an `autoFocus` field).
      const focused = document.activeElement;
      const focusedInside = focused instanceof Node && !!containerRef.current?.contains(focused);
      if (topLayer() === layer && !focusedInside) (initialFocus?.current ?? containerRef.current)?.focus();
    }

    return () => {
      removeLayer(layer);
      unlockScroll?.();
      // A popup closed by Tab or a click elsewhere: focus has already moved on.
      if (popup && !focusLost()) return;
      const target = opener();
      const rendered = !!target?.isConnected && (!hasLayout() || target.getClientRects().length > 0);
      if (target && rendered && target !== document.body) {
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
