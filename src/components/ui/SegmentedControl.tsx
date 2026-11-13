"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { transition } from "@/components/ui/styles";

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: LucideIcon;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Names the group, e.g. "Date range". */
  "aria-label": string;
  /** Stretch segments to fill the width. */
  fullWidth?: boolean;
  className?: string;
}

/** Joined toggle buttons for one-of-N choices (date presets, views). */
export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  "aria-label": label,
  fullWidth = false,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "inline-flex max-w-full overflow-x-auto rounded-control border border-rule bg-surface",
        fullWidth && "flex w-full",
        className
      )}
    >
      {options.map(({ value: v, label: text, icon: Icon }, i) => {
        const active = v === value;
        return (
          <button
            key={v}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(v)}
            className={cn(
              "inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap px-3.5 text-sm",
              transition,
              // Inset ring: the group clips overflow.
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:[outline-offset:-2px]",
              i > 0 && "border-l border-rule",
              fullWidth && "flex-1",
              active
                ? "bg-accent-soft font-semibold text-accent shadow-[inset_0_-2px_0_rgb(var(--accent))]"
                : "text-ink-2 hover:bg-tint-2"
            )}
          >
            {Icon && <Icon aria-hidden="true" size={15} strokeWidth={1.75} />}
            {text}
          </button>
        );
      })}
    </div>
  );
}
