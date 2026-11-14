"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { cn } from "@/components/ui/cn";
import Checkbox from "@/components/ui/Checkbox";
import { inputClass, linkClass, transition } from "@/components/ui/styles";

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

/** `active` value for the "Clear selection" row, which sits above the options. */
const CLEAR = -1;

/** The keyboard's row: the same 2px accent ring a focused control gets. */
const activeRowClass = "bg-hover shadow-[inset_0_0_0_2px_rgb(var(--accent))]";

/**
 * A select-only combobox: focus stays on the trigger, which points at the
 * keyboard's row with aria-activedescendant. Arrows / Home / End move (opening
 * the menu first), Enter / Space toggle, Escape and leaving the trigger close.
 */
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
  // The keyboard's row: an option index, CLEAR, or null (opened by mouse, no key yet).
  const [active, setActive] = useState<number | null>(null);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxId = useId();
  const empty = options.length === 0;
  const hasClear = selected.length > 0;
  const lastRow = options.length - 1;
  // Options or the selection can change under the menu: a row that is gone isn't active.
  const activeRow = active === CLEAR ? (hasClear ? CLEAR : null) : active !== null && active <= lastRow ? active : null;
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
    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, updateMenuPosition]);

  // Options can disappear while open (lookups reload).
  useEffect(() => {
    if (empty) setOpen(false);
  }, [empty]);

  const openAt = (row: number | null) => {
    setActive(row);
    setOpen(true);
  };

  const handleTriggerClick = (e: MouseEvent<HTMLButtonElement>) => {
    // Safari doesn't focus a clicked button; the keys and close-on-blur need it.
    triggerRef.current?.focus();
    if (open) setOpen(false);
    // A click with no pointer (assistive tech) starts on the first option.
    else openAt(e.detail === 0 ? 0 : null);
  };

  const handleTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const firstRow = hasClear ? CLEAR : 0;
    // Closed, or opened by mouse: arrows start from the ends.
    const fromEnd = !open || activeRow === null;
    let next: number;
    switch (e.key) {
      case "ArrowDown":
        next = fromEnd ? 0 : Math.min(activeRow + 1, lastRow);
        break;
      case "ArrowUp":
        next = fromEnd ? lastRow : Math.max(activeRow - 1, firstRow);
        break;
      case "Home":
        next = open ? firstRow : 0;
        break;
      case "End":
        next = lastRow;
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (!open) openAt(0);
        else if (activeRow === CLEAR) {
          onChange([]);
          setActive(0);
        } else if (activeRow !== null) toggle(options[activeRow].value);
        else setOpen(false);
        return;
      case "Escape":
        // Handled here, so an enclosing dialog's Escape listener leaves it (useDialogLayer).
        if (open) {
          e.preventDefault();
          setOpen(false);
        }
        return;
      default:
        return;
    }
    e.preventDefault();
    openAt(next);
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

  const menuShown = open && !!menuPosition;
  const activeId =
    !menuShown || activeRow === null ? undefined : activeRow === CLEAR ? `${listboxId}-clear` : `${listboxId}-${activeRow}`;

  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView?.({ block: "nearest" });
  }, [activeId]);

  const menu =
    menuShown && typeof document !== "undefined" ? (
      // Rows never take focus: mousedown is kept from blurring the trigger (which closes the menu).
      <div
        onMouseDown={(e) => e.preventDefault()}
        className="animate-slide-up fixed z-50 overflow-y-auto rounded-panel border border-rule bg-surface p-1 shadow-elevated"
        style={{
          top: menuPosition.top,
          left: menuPosition.left,
          width: menuPosition.width,
          maxHeight: menuPosition.maxHeight,
        }}
      >
        {hasClear && (
          <button
            type="button"
            id={`${listboxId}-clear`}
            tabIndex={-1}
            onClick={() => {
              onChange([]);
              setActive(null);
            }}
            className={cn(
              linkClass,
              "mb-1 min-h-9 w-full rounded-control px-3 text-left text-xs hover:bg-hover",
              activeRow === CLEAR && activeRowClass
            )}
          >
            Clear selection
          </button>
        )}
        <div id={listboxId} role="listbox" aria-multiselectable="true" aria-label={listLabel ?? ariaLabel ?? placeholder}>
          {options.map((opt, i) => {
            const isSelected = selected.includes(opt.value);
            return (
              <div
                key={opt.value}
                id={`${listboxId}-${i}`}
                onClick={() => {
                  toggle(opt.value);
                  setActive(i);
                }}
                className={cn(
                  "flex min-h-10 cursor-pointer items-start gap-2.5 rounded-control px-3 py-2.5 text-sm hover:bg-hover",
                  transition,
                  activeRow === i && activeRowClass
                )}
                role="option"
                aria-selected={isSelected}
              >
                <Checkbox checked={isSelected} className="mt-0.5" />
                {/* Wraps rather than truncates: "Software & Subscriptions" stays readable. */}
                <span className="min-w-0 flex-1 break-words text-ink">{opt.label}</span>
              </div>
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
        // Space's native click comes on keyup; keydown has already handled the key.
        onKeyUp={(e) => e.key === " " && e.preventDefault()}
        onBlur={() => setOpen(false)}
        id={id}
        role="combobox"
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
        aria-activedescendant={activeId}
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

      {/* Portal into the enclosing aria-modal dialog (its fixed, untransformed
          overlay) so assistive tech doesn't treat the menu as inert content
          outside the dialog; otherwise into body. */}
      {menu
        ? createPortal(menu, containerRef.current?.closest<HTMLElement>('[aria-modal="true"]') ?? document.body)
        : null}
    </div>
  );
}
