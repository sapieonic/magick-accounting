"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { cn } from "@/components/ui/cn";
import Checkbox from "@/components/ui/Checkbox";
import { inputClass, linkClass, transition } from "@/components/ui/styles";
import { useDialogLayer } from "@/hooks/useDialogLayer";

interface Option {
  value: string;
  label: string;
}

interface MultiSelectProps {
  options: Option[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  icon?: ReactNode;
  /** Names the trigger; leave it out when a Field label names it. */
  ariaLabel?: string;
  /** Names the popup listbox, e.g. "Departments". Default `ariaLabel`, then `placeholder`. */
  listLabel?: string;
  /** Options are still loading: an empty list shows `placeholder` instead of "None available". */
  loading?: boolean;
  /** Id for the trigger button (lets a Field label point at it). */
  id?: string;
  "aria-describedby"?: string;
}

const VIEWPORT_PADDING = 12;
/** The popover is at least this wide (16rem) so long labels stay readable next to a narrow trigger. */
const MIN_MENU_WIDTH = 256;
/** Side gutter the popover keeps from the viewport edges. */
const SIDE_GUTTER = 16;

/** The menu's focusable rows (Clear selection, then the options), in order. */
const menuItems = (menu: HTMLElement | null) =>
  menu ? Array.from(menu.querySelectorAll<HTMLButtonElement>("button")) : [];

export default function MultiSelect({
  options,
  selected,
  onChange,
  placeholder,
  icon,
  ariaLabel,
  listLabel,
  loading = false,
  id,
  "aria-describedby": describedBy,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Set when the keyboard opened the menu: the first (or last) row takes focus once it renders.
  const pendingFocus = useRef<"first" | "last" | null>(null);
  const listboxId = useId();
  const empty = options.length === 0;
  const close = useCallback(() => setOpen(false), []);

  // A popup layer: Escape closes only the topmost layer (this menu, or a palette
  // opened over it); Tab closes it and moves on from the trigger, inside an
  // enclosing Modal's trap; focus returns to the trigger when it was in the menu.
  useDialogLayer(open, menuRef, close, { popup: true, returnFocus: triggerRef });

  const updateMenuPosition = useCallback(() => {
    if (!containerRef.current || typeof window === "undefined") return;

    const rect = containerRef.current.getBoundingClientRect();
    const gap = 4;
    const maxMenuHeight = 256;
    const minUsefulSpace = 160;
    const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_PADDING;
    const spaceAbove = rect.top - VIEWPORT_PADDING;
    const openAbove = spaceBelow < minUsefulSpace && spaceAbove > spaceBelow;
    const availableSpace = Math.max(0, openAbove ? spaceAbove : spaceBelow);
    const viewportHeight = Math.max(24, window.innerHeight - VIEWPORT_PADDING * 2);
    const maxHeight = Math.min(
      maxMenuHeight,
      viewportHeight,
      Math.max(48, availableSpace - gap)
    );
    const desiredTop = openAbove ? rect.top - gap - maxHeight : rect.bottom + gap;
    const maxTop = Math.max(VIEWPORT_PADDING, window.innerHeight - VIEWPORT_PADDING - maxHeight);
    // min(max(trigger, 16rem), viewport - 32px), kept on screen.
    const width = Math.min(Math.max(rect.width, MIN_MENU_WIDTH), window.innerWidth - SIDE_GUTTER * 2);
    const left = Math.max(SIDE_GUTTER, Math.min(rect.left, window.innerWidth - SIDE_GUTTER - width));

    setMenuPosition({
      top: Math.min(Math.max(VIEWPORT_PADDING, desiredTop), maxTop),
      left,
      width,
      maxHeight,
    });
  }, []);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e: globalThis.MouseEvent) => {
      const target = e.target as Node;
      const inTrigger = containerRef.current?.contains(target);
      const inMenu = menuRef.current?.contains(target);
      if (!inTrigger && !inMenu) {
        setOpen(false);
      }
    };

    updateMenuPosition();
    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, updateMenuPosition]);

  // Keyboard-opened: focus a row once the menu has rendered.
  useEffect(() => {
    if (!open || !pendingFocus.current || !menuRef.current) return;
    const rows = Array.from(menuRef.current.querySelectorAll<HTMLElement>("[role='option']"));
    (pendingFocus.current === "last" ? rows[rows.length - 1] : rows[0])?.focus();
    pendingFocus.current = null;
  });

  // Options can disappear while open (lookups reload).
  useEffect(() => {
    if (empty) setOpen(false);
  }, [empty]);

  const openWithFocus = (row: "first" | "last") => {
    pendingFocus.current = row;
    if (open) {
      // Already open (by mouse): just move into it.
      const rows = Array.from(menuRef.current?.querySelectorAll<HTMLElement>("[role='option']") ?? []);
      (row === "last" ? rows[rows.length - 1] : rows[0])?.focus();
      pendingFocus.current = null;
    } else {
      setOpen(true);
    }
  };

  const handleTriggerClick = (e: MouseEvent<HTMLButtonElement>) => {
    // Enter / Space (a click with no pointer, detail 0) opens into the first option.
    if (!open && e.detail === 0) openWithFocus("first");
    else setOpen((v) => !v);
  };

  const handleTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      openWithFocus(e.key === "ArrowDown" ? "first" : "last");
    }
  };

  // Arrow keys move between the rows; Enter / Space toggle (native button click).
  const handleMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const rows = menuItems(menuRef.current);
    if (rows.length === 0) return;
    const index = rows.indexOf(document.activeElement as HTMLButtonElement);
    let next: number | null = null;
    if (e.key === "ArrowDown") next = index < 0 ? 0 : Math.min(index + 1, rows.length - 1);
    else if (e.key === "ArrowUp") next = index < 0 ? rows.length - 1 : Math.max(index - 1, 0);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = rows.length - 1;
    if (next === null) return;
    e.preventDefault();
    rows[next].focus();
  };

  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const selectedLabels = options
    .filter((o) => selected.includes(o.value))
    .map((o) => o.label);

  const summary =
    empty && !loading
      ? "None available"
      : selectedLabels.length === 0
        ? placeholder
        : selectedLabels.length === 1
          ? selectedLabels[0]
          : `${selectedLabels.length} selected`;

  const menu =
    open && menuPosition && typeof document !== "undefined" ? (
      <div
        ref={menuRef}
        onKeyDown={handleMenuKeyDown}
        className="animate-slide-up fixed z-50 overflow-y-auto rounded-panel border border-rule bg-surface p-1 shadow-elevated"
        style={{
          top: menuPosition.top,
          left: menuPosition.left,
          width: menuPosition.width,
          maxHeight: menuPosition.maxHeight,
        }}
      >
        {selected.length > 0 && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => onChange([])}
            className={cn(linkClass, "mb-1 min-h-9 w-full rounded-control px-3 text-left text-xs hover:bg-hover")}
          >
            Clear selection
          </button>
        )}
        <div id={listboxId} role="listbox" aria-multiselectable="true" aria-label={listLabel ?? ariaLabel ?? placeholder}>
          {options.map((opt) => {
            const isSelected = selected.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                tabIndex={-1}
                onClick={() => toggle(opt.value)}
                className={cn(
                  "flex min-h-10 w-full cursor-pointer items-start gap-2.5 rounded-control px-3 py-2.5 text-left text-sm hover:bg-hover",
                  transition
                )}
                role="option"
                aria-selected={isSelected}
              >
                <Checkbox checked={isSelected} className="mt-0.5" />
                {/* Wraps rather than truncates: "Software & Subscriptions" stays readable. */}
                <span className="min-w-0 flex-1 break-words text-ink">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    ) : null;

  return (
    <div ref={containerRef} className="relative">
      {icon}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleTriggerClick}
        onKeyDown={handleTriggerKeyDown}
        id={id}
        disabled={empty}
        className={cn(
          inputClass,
          "flex items-center justify-between pr-9 text-left",
          icon ? "pl-10" : "pl-3"
        )}
        aria-describedby={describedBy}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
      >
        <span className={cn("truncate", selectedLabels.length === 0 ? "text-ink-3" : "text-ink")}>
          {summary}
        </span>
      </button>
      <ChevronDown
        aria-hidden="true"
        strokeWidth={1.75}
        className={cn(
          "pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3 transition-transform duration-140",
          open && "rotate-180"
        )}
      />

      {menu ? createPortal(menu, document.body) : null}
    </div>
  );
}
