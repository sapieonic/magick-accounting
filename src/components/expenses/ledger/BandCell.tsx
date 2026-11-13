import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

/**
 * A StatBand cell for content that isn't a single figure (a split bar, a
 * budget meter): same rhythm as `Stat`, caption on top.
 */
export default function BandCell({
  label,
  children,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 basis-[300px] grow flex-col justify-between gap-3 bg-surface px-5 py-[22px]", className)}>
      <span className="cap flex items-center gap-1.5 text-ink-3">{label}</span>
      {children}
    </div>
  );
}
