import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/components/ui/cn";

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

export type StatTone = "default" | "accent" | "amber";

interface StatProps {
  label: ReactNode;
  /** Pre-formatted figure, e.g. formatBaseCurrency(total). */
  value: ReactNode;
  /** One muted line under the figure. */
  sub?: ReactNode;
  icon?: LucideIcon;
  /** amber = pocket/owed money; accent colours the icon only. */
  tone?: StatTone;
  /** The large figure with the indigo wash; use once per band, first. */
  headline?: boolean;
  className?: string;
}

/**
 * One stat in a StatBand. Figures never clip: they are nowrap and sized from
 * the stat's own width (container query units), so long totals shrink to fit.
 */
export function Stat({ label, value, sub, icon: Icon, tone = "default", headline = false, className }: StatProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col justify-between gap-1.5 bg-surface py-[22px] [container-type:inline-size]",
        headline ? "basis-[380px] grow-[2] bg-wash px-6" : "basis-[220px] grow px-5",
        className
      )}
    >
      <span className="cap flex items-center gap-1.5 text-ink-3">
        {Icon && (
          <Icon
            aria-hidden="true"
            size={14}
            strokeWidth={1.75}
            className={tone === "amber" ? "text-amber" : "text-accent"}
          />
        )}
        {label}
      </span>
      <span
        className={cn(
          headline
            ? "figure text-[clamp(28px,10.5cqi,60px)] font-semibold"
            : "num whitespace-nowrap text-[clamp(16px,10cqi,22px)] font-medium",
          tone === "amber" ? "text-amber" : "text-ink"
        )}
      >
        {value}
      </span>
      {sub && <span className="text-[13px] text-ink-3">{sub}</span>}
    </div>
  );
}
