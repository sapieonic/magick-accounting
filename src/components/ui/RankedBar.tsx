import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

export type RankedBarTone = "ramp" | "accent" | "muted" | "pocket";

const fillClass: Record<RankedBarTone, string> = {
  ramp: "bg-ramp",
  accent: "bg-accent-2",
  muted: "bg-bar",
  pocket: "bg-pocket",
};

interface RankedBarProps {
  label: ReactNode;
  /** Pre-formatted amount, e.g. formatBaseCurrency(row.total). */
  amount: ReactNode;
  /** Bar fill, 0–1, usually value / largest value in the list. */
  ratio: number;
  /** Share of the whole in percent (0–100), shown muted after the label. */
  share?: number;
  /** Leading visual, e.g. <CategoryGlyph name={…} /> or an initials avatar. */
  leading?: ReactNode;
  tone?: RankedBarTone;
  className?: string;
}

/** One row of a ranked list: name, share %, amount and a thin bar. */
export default function RankedBar({
  label,
  amount,
  ratio,
  share,
  leading,
  tone = "ramp",
  className,
}: RankedBarProps) {
  // NaN would survive Math.min/max and fill the whole bar.
  const fill = Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0;
  const width = `${fill * 100}%`;
  return (
    <div
      className={cn(
        "grid items-center gap-x-3 gap-y-1",
        leading ? "grid-cols-[28px_minmax(0,1fr)_auto]" : "grid-cols-[minmax(0,1fr)_auto]",
        className
      )}
    >
      {leading && <span className="row-span-2 flex">{leading}</span>}
      {/* The label truncates; the share stays whole beside it. */}
      <span className="flex min-w-0 items-baseline gap-1.5">
        <span className="ell">{label}</span>
        {share !== undefined && Number.isFinite(share) && (
          <span className="shrink-0 text-xs text-ink-3">{share.toFixed(1)}%</span>
        )}
      </span>
      <span className="num whitespace-nowrap text-right text-[13px]">{amount}</span>
      <div className={cn("h-1.5 overflow-hidden rounded-[3px] bg-sunk", leading ? "col-[2/-1]" : "col-span-full")}>
        <div className={cn("h-full rounded-[3px]", fillClass[tone])} style={{ width }} />
      </div>
    </div>
  );
}
