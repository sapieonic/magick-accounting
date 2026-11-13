import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { ICON_STROKE } from "@/components/ui/styles";

export interface DetailItem {
  label: string;
  icon?: LucideIcon;
  value: ReactNode;
}

/** Ruled label/value list for detail panels: caption on the left, value right-aligned. */
export default function DetailList({ items, className }: { items: DetailItem[]; className?: string }) {
  return (
    <dl className={cn("flex flex-col", className)}>
      {items.map(({ label, icon: Icon, value }) => (
        <div
          key={label}
          className="flex min-h-[44px] flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-rule-2 py-2 first:border-t-0"
        >
          <dt className="cap flex items-center gap-1.5 text-ink-3">
            {Icon && <Icon aria-hidden="true" size={13} strokeWidth={ICON_STROKE} />}
            {label}
          </dt>
          <dd className="min-w-0 max-w-full text-right text-sm text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
