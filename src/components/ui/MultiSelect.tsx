"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/components/ui/cn";
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
  ariaLabel?: string;
  /** Id for the trigger button (lets a Field label point at it). */
  id?: string;
  "aria-describedby"?: string;
}

export default function MultiSelect({
  options,
  selected,
  onChange,
  placeholder,
  icon,
  ariaLabel,
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
  const menuRef = useRef<HTMLDivElement>(null);

  const updateMenuPosition = useCallback(() => {
    if (!containerRef.current || typeof window === "undefined") return;

    const rect = containerRef.current.getBoundingClientRect();
    const viewportPadding = 12;
    const gap = 4;
    const maxMenuHeight = 256;
    const minUsefulSpace = 160;
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const spaceAbove = rect.top - viewportPadding;
    const openAbove = spaceBelow < minUsefulSpace && spaceAbove > spaceBelow;
    const availableSpace = Math.max(0, openAbove ? spaceAbove : spaceBelow);
    const viewportHeight = Math.max(24, window.innerHeight - viewportPadding * 2);
    const maxHeight = Math.min(
      maxMenuHeight,
      viewportHeight,
      Math.max(48, availableSpace - gap)
    );
    const desiredTop = openAbove ? rect.top - gap - maxHeight : rect.bottom + gap;
    const maxTop = Math.max(viewportPadding, window.innerHeight - viewportPadding - maxHeight);

    setMenuPosition({
      top: Math.min(Math.max(viewportPadding, desiredTop), maxTop),
      left: rect.left,
      width: rect.width,
      maxHeight,
    });
  }, []);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      const inTrigger = containerRef.current?.contains(target);
      const inMenu = menuRef.current?.contains(target);
      if (!inTrigger && !inMenu) {
        setOpen(false);
      }
    };
    // Captured and stopped so Escape closes only this menu, not a Modal around it.
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
    };

    updateMenuPosition();
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape, true);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape, true);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, updateMenuPosition]);

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
    selectedLabels.length === 0
      ? placeholder
      : selectedLabels.length === 1
        ? selectedLabels[0]
        : `${selectedLabels.length} selected`;

  const menu =
    open && menuPosition && typeof document !== "undefined" ? (
      <div
        ref={menuRef}
        role="listbox"
        aria-label={ariaLabel || placeholder}
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
            onClick={() => onChange([])}
            className={cn(linkClass, "mb-1 min-h-9 w-full rounded-control px-3 text-left text-xs hover:bg-hover")}
          >
            Clear selection
          </button>
        )}
        {options.length === 0 ? (
          <p className="px-3 py-2 text-xs text-ink-3">No options</p>
        ) : (
          options.map((opt) => {
            const isSelected = selected.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggle(opt.value)}
                className={cn("flex min-h-10 w-full cursor-pointer items-center gap-2.5 rounded-control px-3 text-left text-sm hover:bg-hover", transition)}
                role="option"
                aria-selected={isSelected}
              >
                <span
                  className={cn(
                    "flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border",
                    isSelected ? "border-accent bg-accent text-accent-ink" : "border-rule bg-surface"
                  )}
                >
                  {isSelected && <Check aria-hidden="true" className="h-3 w-3" strokeWidth={2.5} />}
                </span>
                <span className="truncate text-ink">{opt.label}</span>
              </button>
            );
          })
        )}
      </div>
    ) : null;

  return (
    <div ref={containerRef} className="relative">
      {icon}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        id={id}
        className={cn(inputClass, "flex items-center justify-between pr-9 text-left", icon ? "pl-10" : "pl-3")}
        aria-describedby={describedBy}
        aria-haspopup="listbox"
        aria-expanded={open}
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
