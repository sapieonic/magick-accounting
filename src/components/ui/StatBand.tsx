import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { withPaise } from "@/components/ui/Money";
import { ICON_STROKE } from "@/components/ui/styles";

interface StatBandProps {
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}

/** The totals band: stats on one ruled strip that wraps evenly. */
export default function StatBand({ children, className, "aria-label": label = "Totals" }: StatBandProps) {
  return (
    <section
      aria-label={label}
      className={cn("flex flex-wrap gap-px overflow-hidden rounded-panel border border-rule bg-rule", className)}
    >
      {children}
    </section>
  );
}

export type StatTone = "default" | "amber";

interface StatProps {
  label: ReactNode;
  /** Pre-formatted figure, e.g. formatBaseCurrency(total). */
  value: ReactNode;
  /** One muted line under the figure. */
  sub?: ReactNode;
  icon?: LucideIcon;
  /** amber = pocket/owed money (the figure); the icon is always muted. */
  tone?: StatTone;
  /** The large figure; use once per band, first. */
  headline?: boolean;
  /** A link or text button under `sub` that acts on the figure (e.g. "Review"). */
  action?: ReactNode;
  className?: string;
}

/**
 * One stat in a StatBand. Figures never clip: they are nowrap and sized from
 * the stat's own width (container query units), so long totals shrink to fit.
 */
export function Stat({ label, value, sub, icon: Icon, tone = "default", headline = false, action, className }: StatProps) {
  return (
    <div
      className={cn(
        // Top-aligned, so a stat without `sub` lines up with its neighbours.
        "flex min-w-0 flex-col justify-start gap-2 bg-surface px-6 py-5 [container-type:inline-size]",
        headline ? "basis-[380px] grow-[2]" : "basis-[220px] grow",
        className
      )}
    >
      <span className="cap flex items-center gap-1.5 text-ink-3">
        {Icon && <Icon aria-hidden="true" size={14} strokeWidth={ICON_STROKE} className="shrink-0" />}
        {label}
      </span>
      <span
        className={cn(
          headline
            ? "figure text-[clamp(28px,10.5cqi,56px)] font-medium tracking-[-0.02em]"
            : "figure text-[clamp(18px,10cqi,26px)] font-medium",
          tone === "amber" ? "text-amber" : "text-ink"
        )}
      >
        {withPaise(value)}
      </span>
      {sub && <span className="text-[13px] leading-5 text-ink-3">{sub}</span>}
      {action && <div className="-mb-2 flex flex-wrap items-center gap-x-3">{action}</div>}
    </div>
  );
}

/**
 * A StatBand cell for content that isn't a single figure (a split bar, a
 * budget meter): same rhythm as `Stat`, caption on top.
 */
export function BandCell({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 basis-[300px] grow flex-col justify-start gap-3 bg-surface px-6 py-5", className)}>
      <span className="cap flex items-center gap-1.5 text-ink-3">{label}</span>
      {children}
    </div>
  );
}
