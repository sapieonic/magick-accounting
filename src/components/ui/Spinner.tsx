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

export function PageLoader() {
  return (
    <div className="flex min-h-[16rem] flex-col items-center justify-center gap-4 rounded-panel border border-rule bg-surface bg-wash px-6 py-10 text-center">
      <Spinner size="lg" />
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-ink">Loading data...</p>
        <p className="text-xs text-ink-3">Serverless APIs can take a few seconds to warm up.</p>
      </div>
    </div>
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
