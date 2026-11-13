import type { ReactNode } from "react";
import { CalendarClock, CircleCheck } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";
import { cn } from "@/components/ui/cn";
import { formatBaseCurrency } from "@/lib/currency";
import { roundMoney } from "@/lib/asset";
import { TRIP_STATUS_LABELS, type TripStatus } from "@/lib/trip";
import type { TripPerson } from "@/types/trip";

/** Trip status as a Badge; `children` replaces the label (e.g. "Day 2 of 4"). */
export function TripStatusBadge({ status, children }: { status: TripStatus; children?: ReactNode }) {
  const label = children ?? TRIP_STATUS_LABELS[status];
  if (status === "ongoing") return <Badge tone="success" dot>{label}</Badge>;
  if (status === "upcoming") return <Badge tone="accent" icon={CalendarClock}>{label}</Badge>;
  return <Badge icon={CircleCheck}>{label}</Badge>;
}

/** Overlapping avatars, at most `max`, then "+N". */
export function TravelerAvatars({ travelers, max = 4 }: { travelers: TripPerson[]; max?: number }) {
  if (travelers.length === 0) return null;
  const shown = travelers.slice(0, max);
  const extra = travelers.length - shown.length;
  const names = travelers.map((t) => t.name).join(", ");
  return (
    // A 4px overlap, so the next avatar doesn't cover the second initial.
    <div className="flex shrink-0 items-center -space-x-1" role="img" aria-label={`Travelers: ${names}`} title={names}>
      {shown.map((person) => (
        <Avatar key={person._id} name={person.name || person.email} photoURL={person.photoURL} size={28} className="ring-2 ring-surface" />
      ))}
      {extra > 0 && (
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sunk text-[10px] font-semibold text-ink-2 ring-2 ring-surface">
          +{extra}
        </span>
      )}
    </div>
  );
}

/**
 * How much of a trip budget is spent: indigo, amber above 80%, red once over.
 * Only meaningful for totals covering the whole trip (admins).
 */
export function BudgetMeter({ spent, budget, className }: { spent: number; budget: number; className?: string }) {
  const ratio = budget > 0 ? spent / budget : spent > 0 ? Infinity : 0;
  const percent = Number.isFinite(ratio) ? Math.round(ratio * 100) : 100;
  const over = ratio > 1;
  const warn = !over && ratio > 0.8;
  const remaining = roundMoney(budget - spent);
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div
        className="h-1.5 overflow-hidden rounded-[3px] bg-sunk"
        role="progressbar"
        aria-label="Budget used"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(percent, 100)}
      >
        <div
          className={cn("h-full rounded-[3px]", over ? "bg-danger" : warn ? "bg-pocket" : "bg-ramp")}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
      <div className="flex flex-wrap justify-between gap-x-3 text-xs text-ink-3">
        <span className={cn("num font-medium", over ? "text-danger" : warn ? "text-amber" : "text-ink-2")}>{percent}%</span>
        <span className="num">
          {over
            ? `${formatBaseCurrency(-remaining)} over ${formatBaseCurrency(budget)}`
            : `${formatBaseCurrency(remaining)} left of ${formatBaseCurrency(budget)}`}
        </span>
      </div>
    </div>
  );
}
