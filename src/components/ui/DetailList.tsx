import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { ICON_STROKE } from "@/components/ui/styles";

export interface DetailItem {
  label: string;
  icon?: LucideIcon;
  value: ReactNode;
}

const ROW = "border-t border-rule-2 first:border-t-0";

/**
 * Ruled caption/value list for a detail panel. `layout="justified"` (default)
 * puts the caption left and the value right-aligned; `"columns"` lines the
 * values up in a left-aligned column after a 7rem caption column (for longer
 * values: an account's name, email, role note).
 */
export default function DetailList({
  items,
  layout = "justified",
  className,
}: {
  items: DetailItem[];
  layout?: "justified" | "columns";
  className?: string;
}) {
  const columns = layout === "columns";
  return (
    <dl className={cn("flex flex-col", className)}>
      {items.map(({ label, icon: Icon, value }) => (
        <div
          key={label}
          className={cn(
            ROW,
            columns
              ? "grid min-h-10 grid-cols-[minmax(0,7rem)_minmax(0,1fr)] items-baseline gap-x-3 py-2.5"
              : "flex min-h-10 flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2"
          )}
        >
          <dt className={cn("cap flex items-center gap-1.5 text-ink-3", columns ? "min-w-0" : "shrink-0 self-center")}>
            {Icon && <Icon aria-hidden="true" size={13} strokeWidth={ICON_STROKE} />}
            {label}
          </dt>
          <dd className={cn("min-w-0 max-w-full text-sm text-ink", columns ? "break-words" : "text-right")}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
