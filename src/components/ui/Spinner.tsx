"use client";

import { cn } from "@/components/ui/cn";

const SIZES = {
  sm: "h-4 w-4 border-[1.5px]",
  md: "h-6 w-6 border-2",
  lg: "h-12 w-12 border-[2.5px]",
} as const;

const TONES = {
  /** Faint indigo ring, indigo arc. */
  accent: "border-accent/20 border-t-accent",
  /** Text-coloured arc with a gap: inside buttons, whatever their variant. */
  current: "border-current border-r-transparent",
} as const;

/**
 * Thin indigo ring with a rotating arc: a "Loading" status on its own, or a
 * decorative ring (aria-hidden) when visible text beside it says what's loading.
 */
export default function Spinner({
  className,
  size = "md",
  tone = "accent",
  decorative = false,
}: {
  className?: string;
  size?: keyof typeof SIZES;
  tone?: keyof typeof TONES;
  decorative?: boolean;
}) {
  // A span, so it is valid inside buttons and other phrasing content.
  return (
    <span
      className={cn("inline-block shrink-0 animate-spin rounded-full", SIZES[size], TONES[tone], className)}
      {...(decorative ? { "aria-hidden": true } : { role: "status", "aria-label": "Loading" })}
    />
  );
}

/** Small spinner + visible label; the label is the status, announced once. */
export function InlineLoader({
  label = "Loading...",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div role="status" className={cn("inline-flex items-center gap-2 text-sm text-ink-3", className)}>
      <Spinner size="sm" decorative />
      <span>{label}</span>
    </div>
  );
}
