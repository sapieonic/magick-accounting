import { format } from "date-fns";
import { History, PackagePlus, PencilLine, Undo2, UserMinus, UserPlus, type LucideIcon } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { ICON_STROKE, panelPadX } from "@/components/ui/styles";

interface Person {
  _id: string;
  name: string;
  email: string;
}

export interface AssetAssignment {
  _id: string;
  assignedTo: Person;
  assignedBy: Person;
  department: { _id: string; name: string };
  purpose: string;
  location: string;
  assignedAt: string;
  returnedAt?: string | null;
}

export interface AssetEvent {
  _id: string;
  type: string;
  reason: string;
  changes: Record<string, { from: unknown; to: unknown }>;
  occurredAt: string;
  actor?: Person;
}

const EVENT_ICONS: Record<string, { icon: LucideIcon; className: string }> = {
  created: { icon: PackagePlus, className: "text-accent" },
  updated: { icon: PencilLine, className: "text-ink-3" },
  assigned: { icon: UserPlus, className: "text-accent" },
  unassigned: { icon: UserMinus, className: "text-amber" },
  reversed: { icon: Undo2, className: "text-danger" },
};

// Timestamps (not calendar days), so the viewer's local day is right.
const day = (value: string) => format(new Date(value), "d MMM yyyy");
const itemClass = cn("flex gap-3 border-t border-rule-2 py-3 first:border-t-0", panelPadX);

function Empty({ children }: { children: string }) {
  return <p className={cn("pb-5 text-sm text-ink-3", panelPadX)}>{children}</p>;
}

/** Ruled list of who held the asset, newest first as returned by the API. */
export function AssignmentList({ assignments }: { assignments: AssetAssignment[] }) {
  if (assignments.length === 0) return <Empty>This asset has not been assigned yet.</Empty>;
  return (
    <ol aria-label="Assignments">
      {assignments.map((assignment) => {
        const place = [assignment.department?.name, assignment.location].filter(Boolean).join(" · ");
        return (
          <li key={assignment._id} className={cn(itemClass, "flex-wrap justify-between gap-y-1")}>
            <div className="flex min-w-0 flex-[1_1_200px] flex-col gap-0.5">
              <span className="ell font-medium text-ink">{assignment.assignedTo.name}</span>
              <span className="ell text-xs text-ink-3">{assignment.assignedTo.email}</span>
              <span className="text-xs text-ink-3">
                {assignment.purpose || "No purpose recorded"} · Assigned by {assignment.assignedBy?.name || "Administrator"}
              </span>
            </div>
            <div className="flex flex-col items-end gap-0.5 text-right">
              <span className="num whitespace-nowrap text-sm text-ink-2">
                {day(assignment.assignedAt)} – {assignment.returnedAt ? day(assignment.returnedAt) : "Present"}
              </span>
              {place && <span className="text-xs text-ink-3">{place}</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Audit timeline: one ruled row per event with an icon for its type. */
export function AssetEventList({ events }: { events: AssetEvent[] }) {
  if (events.length === 0) return <Empty>No audit events recorded.</Empty>;
  return (
    <ol aria-label="Audit events">
      {events.map((event) => {
        const { icon: Icon, className } = EVENT_ICONS[event.type] ?? { icon: History, className: "text-ink-3" };
        const changed = Object.keys(event.changes || {});
        return (
          <li key={event._id} className={itemClass}>
            <Icon aria-hidden="true" size={16} strokeWidth={ICON_STROKE} className={cn("mt-0.5 shrink-0", className)} />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-medium capitalize text-ink">{event.type.replaceAll("_", " ")}</span>
                <span className="num text-xs text-ink-3">{format(new Date(event.occurredAt), "d MMM yyyy, HH:mm")}</span>
              </div>
              <span className="text-xs text-ink-3">
                By {event.actor?.name || "Administrator"}
                {event.reason ? ` · ${event.reason}` : ""}
              </span>
              {changed.length > 0 && <span className="text-xs text-ink-2">Changed: {changed.join(", ")}</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
