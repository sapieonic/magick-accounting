"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

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
}

export default function MultiSelect({
  options,
  selected,
  onChange,
  placeholder,
  icon,
  ariaLabel,
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
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    updateMenuPosition();
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
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
        className="animate-slide-up fixed z-50 overflow-y-auto rounded-lg border border-line bg-surface-elevated p-1 shadow-lg dark:shadow-black/60"
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
            className="mb-1 w-full rounded-md px-3 py-1.5 text-left text-xs font-medium text-brand-600 transition-colors hover:bg-subtle dark:text-brand-400"
          >
            Clear selection
          </button>
        )}
        {options.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">No options</p>
        ) : (
          options.map((opt) => {
            const isSelected = selected.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggle(opt.value)}
                className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm transition-colors hover:bg-subtle"
                role="option"
                aria-selected={isSelected}
              >
                <span
                  className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${
                    isSelected
                      ? "border-brand-500 bg-brand-500 text-white"
                      : "border-line bg-surface"
                  }`}
                >
                  {isSelected && <Check className="h-3 w-3" />}
                </span>
                <span className="truncate text-foreground">{opt.label}</span>
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
        className="input-field flex w-full items-center justify-between pl-10 pr-9 text-left text-sm"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        <span className={`truncate ${selectedLabels.length === 0 ? "text-muted-foreground" : "text-foreground"}`}>
          {summary}
        </span>
      </button>
      <ChevronDown
        className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-transform ${
          open ? "rotate-180" : ""
        }`}
      />

      {menu ? createPortal(menu, document.body) : null}
    </div>
  );
}
