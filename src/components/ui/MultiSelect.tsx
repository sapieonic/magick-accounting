"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
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
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

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

      {open && (
        <div className="animate-slide-up absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-line bg-surface-elevated p-1 shadow-lg dark:shadow-black/60">
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
      )}
    </div>
  );
}
