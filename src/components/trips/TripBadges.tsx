import clsx from "clsx";
import { TRIP_STATUS_LABELS, type TripStatus } from "@/lib/trip";
import type { TripPerson } from "@/types/trip";

const TRIP_STATUS_PILL_CLASSES: Record<TripStatus, string> = {
  ongoing:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
  upcoming: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300",
  completed: "border-line bg-subtle text-muted",
};

/** Status pill; ongoing trips get a pulsing dot. `children` overrides the label. */
export function TripStatusPill({
  status,
  size = "sm",
  className,
  children,
}: {
  status: TripStatus;
  size?: "sm" | "md";
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <span
      className={clsx(
        "inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border font-semibold",
        size === "md" ? "px-2.5 py-0.5 text-xs" : "px-2 py-0.5 text-[11px]",
        TRIP_STATUS_PILL_CLASSES[status],
        className
      )}
    >
      {status === "ongoing" && (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" aria-hidden="true" />
      )}
      {children ?? TRIP_STATUS_LABELS[status]}
    </span>
  );
}

function initials(person: TripPerson): string {
  const parts = (person.name || person.email || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** A person's photo, or their initials when they have none. */
export function PersonAvatar({ person, className = "h-8 w-8 text-xs" }: { person: TripPerson; className?: string }) {
  return person.photoURL ? (
    <img
      src={person.photoURL}
      alt={person.name}
      title={person.name}
      className={clsx(className, "flex-shrink-0 rounded-full object-cover ring-2 ring-surface")}
      referrerPolicy="no-referrer"
    />
  ) : (
    <span
      title={person.name}
      className={clsx(
        className,
        "flex flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-100 to-brand-200 font-bold text-brand-700 ring-2 ring-surface dark:from-brand-500/25 dark:to-brand-500/40 dark:text-brand-200"
      )}
    >
      {initials(person)}
    </span>
  );
}

/** Overlapping avatars, at most `max`, then "+N". */
export function TravelerAvatars({
  travelers,
  max = 4,
  avatarClassName = "h-7 w-7 text-[10px]",
}: {
  travelers: TripPerson[];
  max?: number;
  avatarClassName?: string;
}) {
  if (travelers.length === 0) return null;
  const shown = travelers.slice(0, max);
  const extra = travelers.length - shown.length;
  const names = travelers.map((t) => t.name).join(", ");
  return (
    <div className="flex flex-shrink-0 items-center -space-x-2" role="img" aria-label={`Travelers: ${names}`} title={names}>
      {shown.map((person) => (
        <PersonAvatar key={person._id} person={person} className={avatarClassName} />
      ))}
      {extra > 0 && (
        <span
          className={clsx(
            avatarClassName,
            "flex items-center justify-center rounded-full bg-subtle font-semibold text-muted ring-2 ring-surface"
          )}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}

/** How much of a budget is spent: amber above 80%, red once over. */
export function budgetUsage(spent: number, budget: number) {
  const ratio = budget > 0 ? spent / budget : spent > 0 ? Infinity : 0;
  const percent = Number.isFinite(ratio) ? Math.round(ratio * 100) : 100;
  const over = ratio > 1;
  const warn = !over && ratio > 0.8;
  return {
    percent,
    over,
    /** Fill width, capped at 100%. */
    width: `${Math.min(percent, 100)}%`,
    barClass: over ? "bg-red-500" : warn ? "bg-amber-500" : "bg-emerald-500",
    textClass: over
      ? "text-red-600 dark:text-red-400"
      : warn
        ? "text-amber-600 dark:text-amber-400"
        : "text-muted-foreground",
  };
}
