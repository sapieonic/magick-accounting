import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/components/ui/cn";

export type NoticeTone = "neutral" | "danger" | "success";

const toneClass: Record<NoticeTone, { box: string; icon: string }> = {
  neutral: { box: "border-rule bg-sunk", icon: "text-ink-3" },
  danger: { box: "border-danger/30 bg-danger-soft", icon: "text-danger" },
  success: { box: "border-success/30 bg-success-soft", icon: "text-success" },
};

interface NoticeProps {
  tone?: NoticeTone;
  icon?: LucideIcon;
  /** One plain-language line: what the state is. */
  title: ReactNode;
  /** Optional detail: why, and what to do next. */
  children?: ReactNode;
  /** Buttons or links that resolve the notice. */
  actions?: ReactNode;
  className?: string;
}

/** A ruled in-place message (status, rejection reason, what happens next); no shadow, never colour-only. */
export default function Notice({ tone = "neutral", icon: Icon, title, children, actions, className }: NoticeProps) {
  const t = toneClass[tone];
  return (
    <div
      // Polite for every tone: a notice describes the state the page loaded
      // in, and an `alert` would interrupt on every visit.
      role="status"
      className={cn("flex gap-3 rounded-panel border p-3 text-sm text-ink", t.box, className)}
    >
      {Icon && <Icon aria-hidden="true" size={18} strokeWidth={1.75} className={cn("mt-px shrink-0", t.icon)} />}
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="font-semibold">{title}</p>
        {children && <div className="text-ink-2">{children}</div>}
        {actions && <div className="flex flex-wrap gap-2 pt-1">{actions}</div>}
      </div>
    </div>
  );
}
