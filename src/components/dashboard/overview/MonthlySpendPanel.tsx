import Link from "next/link";
import { format } from "date-fns";
import { ChartNoAxesColumn } from "lucide-react";
import Panel from "@/components/ui/Panel";
import EmptyState from "@/components/ui/EmptyState";
import { cn } from "@/components/ui/cn";
import { focusRing, transition } from "@/components/ui/styles";
import { formatBaseCurrency } from "@/lib/currency";
import { formatCompactBase, monthFromKey, plural } from "./format";
import type { MonthPoint } from "./types";

function rangeLabel(data: MonthPoint[]): string | undefined {
  if (!data.length) return undefined;
  const first = monthFromKey(data[0].key);
  const last = monthFromKey(data[data.length - 1].key);
  const sameYear = first.getFullYear() === last.getFullYear();
  return `${format(first, sameYear ? "MMM" : "MMM yyyy")} – ${format(last, "MMM yyyy")}`;
}

/**
 * Six months of spend as direct-labelled bars: the peak month in the accent,
 * the current (partial) month hatched. Each bar opens that month's expenses.
 */
export default function MonthlySpendPanel({ data }: { data: MonthPoint[] }) {
  const hasData = data.some((m) => m.total > 0);
  const max = Math.max(0, ...data.map((m) => m.total));
  const currentIndex = data.length - 1;
  const peakIndex = hasData ? data.findIndex((m) => m.total === max) : -1;
  const peak = data[peakIndex];
  const current = data[currentIndex];

  return (
    <Panel title="Monthly spend" meta={rangeLabel(data)} bodyClassName="gap-4">
      {hasData ? (
        <>
          <ol aria-label="Monthly spend" className="grid h-[236px] auto-cols-[minmax(0,1fr)] grid-flow-col">
            {data.map((m, i) => {
              const isPeak = i === peakIndex;
              const isCurrent = i === currentIndex;
              const name = `${format(monthFromKey(m.key), "MMMM yyyy")}${isCurrent ? " to date" : ""}`;
              const label = `${name}: ${formatBaseCurrency(m.total)}, ${plural(m.count, "expense")}`;
              return (
                <li key={m.key} className="flex min-w-0">
                  <Link
                    href={`/dashboard/expenses?month=${m.key}`}
                    aria-label={label}
                    title={label}
                    className={cn("flex min-w-0 flex-1 flex-col rounded-control hover:bg-tint", transition, focusRing)}
                  >
                    <span
                      className={cn(
                        "num whitespace-nowrap pb-1.5 pt-1 text-center text-xs",
                        isPeak ? "font-semibold text-accent" : "text-ink-2"
                      )}
                    >
                      {formatCompactBase(m.total)}
                    </span>
                    <span className="flex flex-1 items-end justify-center border-b border-ink px-[clamp(3px,0.6vw,6px)]">
                      <span
                        className={cn(
                          "w-full max-w-[84px] rounded-t-md",
                          isCurrent ? "bg-hatch" : isPeak ? "bg-gradient-to-t from-accent to-accent-2" : "bg-bar"
                        )}
                        style={{ height: `${max > 0 ? (m.total / max) * 100 : 0}%`, minHeight: m.total > 0 ? 2 : 0 }}
                      />
                    </span>
                    <span className={cn("pb-1 pt-2 text-center text-xs", isPeak ? "font-semibold text-accent" : "text-ink-3")}>
                      {m.month}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
          <p className="text-[13px] text-ink-3 [text-wrap:pretty]">
            Peak in {format(monthFromKey(peak.key), "MMMM")} at{" "}
            <span className="num text-ink">{formatBaseCurrency(peak.total)}</span>.{" "}
            {format(monthFromKey(current.key), "MMMM")} is hatched: month to date.
          </p>
        </>
      ) : (
        <EmptyState
          icon={<ChartNoAxesColumn />}
          title="No trend data yet"
          description="Add your first expense to generate insights."
        />
      )}
    </Panel>
  );
}
