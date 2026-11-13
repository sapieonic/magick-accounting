"use client";

import { cn } from "@/components/ui/cn";

const SIZES = {
  sm: "h-4 w-4 border-[1.5px]",
  md: "h-6 w-6 border-2",
  lg: "h-12 w-12 border-[2.5px]",
} as const;

/** Thin indigo ring with a rotating arc. */
export default function Spinner({ className, size = "md" }: { className?: string; size?: keyof typeof SIZES }) {
  return (
    <div
      className={cn(
        "inline-block shrink-0 animate-spin rounded-full border-accent/20 border-t-accent",
        SIZES[size],
        className
      )}
      role="status"
      aria-label="Loading"
    />
  );
}

export function InlineLoader({
  label = "Loading...",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex items-center gap-2 text-sm text-ink-3", className)}>
      <Spinner size="sm" />
      <span>{label}</span>
    </div>
  );
}
