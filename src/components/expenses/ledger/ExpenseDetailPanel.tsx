"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { focusRing, panelClass } from "@/components/ui/styles";
import {
  DETAIL_PANEL_KEY_STEP,
  DETAIL_PANEL_KEY_STEP_LARGE,
  DETAIL_PANEL_MIN,
  DETAIL_PANEL_WIDTH_KEY,
  clampDetailPanelWidth,
  defaultDetailPanelWidth,
  detailPanelMax,
} from "@/components/expenses/ledger/detail-panel";

interface ExpenseDetailPanelProps {
  id: string;
  children: ReactNode;
}

function readStoredWidth(): number | null {
  try {
    const raw = localStorage.getItem(DETAIL_PANEL_WIDTH_KEY);
    if (raw == null) return null;
    const width = Number(raw);
    return Number.isFinite(width) ? width : null;
  } catch {
    // Storage unavailable (private mode); the width still works for this visit.
    return null;
  }
}

function writeStoredWidth(width: number | null) {
  try {
    if (width == null) localStorage.removeItem(DETAIL_PANEL_WIDTH_KEY);
    else localStorage.setItem(DETAIL_PANEL_WIDTH_KEY, String(width));
  } catch {
    // Not persisted; the resize still applies for this visit.
  }
}

/**
 * The expense detail side panel. Its width is dragged from the leading edge
 * (or nudged from the keyboard) and remembered, so a receipt can be opened
 * wide enough to read. The width stays clamped to leave the ledger a minimum.
 */
export default function ExpenseDetailPanel({ id, children }: ExpenseDetailPanelProps) {
  const asideRef = useRef<HTMLElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  /** The width the user dragged to. Null until then, so the default can follow the row. */
  const [chosen, setChosen] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const containerRef = useRef(0);
  containerRef.current = containerWidth;

  const width = clampDetailPanelWidth(chosen ?? defaultDetailPanelWidth(containerWidth), containerWidth);
  const max = detailPanelMax(containerWidth);

  useLayoutEffect(() => {
    setChosen(readStoredWidth());
  }, []);

  useLayoutEffect(() => {
    const parent = asideRef.current?.parentElement;
    if (!parent) return;
    const measure = () => setContainerWidth(parent.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const { cursor, userSelect } = document.body.style;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = cursor;
      document.body.style.userSelect = userSelect;
    };
  }, [dragging]);

  const commit = (next: number) => {
    const clamped = clampDetailPanelWidth(next, containerRef.current);
    setChosen(clamped);
    writeStoredWidth(clamped);
  };

  const drag = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // jsdom has no live pointer to capture; move events are still delivered to the handle.
    }
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: width };
    setDragging(true);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || event.pointerId !== current.pointerId) return;
    // The panel sits on the right, so dragging the handle left widens it.
    const next = current.startWidth - (event.clientX - current.startX);
    setChosen(clampDetailPanelWidth(next, containerRef.current));
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || event.pointerId !== current.pointerId) return;
    drag.current = null;
    setDragging(false);
    const next = current.startWidth - (event.clientX - current.startX);
    // A click to focus the handle shouldn't lock the responsive default.
    if (Math.round(next) === Math.round(current.startWidth)) return;
    commit(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? DETAIL_PANEL_KEY_STEP_LARGE : DETAIL_PANEL_KEY_STEP;
    let next: number | null = null;
    if (event.key === "ArrowLeft") next = width + step;
    else if (event.key === "ArrowRight") next = width - step;
    else if (event.key === "Home") next = DETAIL_PANEL_MIN;
    else if (event.key === "End") next = detailPanelMax(containerRef.current);
    else return;
    event.preventDefault();
    commit(next);
  };

  const reset = () => {
    setChosen(null);
    writeStoredWidth(null);
  };

  return (
    <aside
      ref={asideRef}
      id={id}
      aria-label="Selected expense"
      style={{ width }}
      className="relative sticky top-4 shrink-0"
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize expense details"
        aria-valuemin={DETAIL_PANEL_MIN}
        aria-valuemax={max}
        aria-valuenow={width}
        aria-valuetext={`${width} pixels`}
        aria-controls={id}
        tabIndex={0}
        title="Drag to resize. Double-click to reset."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={reset}
        onKeyDown={onKeyDown}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className={cn(
          // The 20px gutter is the hit area (24px wide, so it clears WCAG 2.5.8).
          "absolute inset-y-0 -left-5 z-10 flex w-6 cursor-col-resize touch-none select-none items-center justify-center rounded-full",
          focusRing
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "w-1 rounded-full transition-[height,background-color] duration-140",
            dragging || hovered || focused ? "h-16 bg-accent" : "h-10 bg-control-line"
          )}
        />
      </div>
      {/* <main> scrolls below the 4rem top bar, so the panel fits in 100dvh
          minus the bar and a 1rem gap above and below. */}
      <div className={cn(panelClass, "max-h-[calc(100dvh-6rem)] overflow-y-auto")}>{children}</div>
    </aside>
  );
}
