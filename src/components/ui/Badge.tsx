import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { focusRing, transition } from "@/components/ui/styles";

export type Tone = "neutral" | "accent" | "amber" | "success" | "danger";

const toneClass: Record<Tone, string> = {
  neutral: "bg-sunk text-ink-2",
  accent: "bg-accent-soft text-accent",
  amber: "bg-amber-soft text-amber",
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
};

const dotClass: Record<Tone, string> = {
  neutral: "bg-ink-3",
  accent: "bg-accent",
  amber: "bg-pocket",
  success: "bg-success",
  danger: "bg-danger",
};

/** 7px status dot in a tone's colour (company = accent, pocket = amber). */
export function Dot({ tone = "neutral", className }: { tone?: Tone; className?: string }) {
  return <span aria-hidden="true" className={cn("inline-block h-[7px] w-[7px] shrink-0 rounded-full", dotClass[tone], className)} />;
}

interface BadgeProps {
  tone?: Tone;
  icon?: LucideIcon;
  /** Leading status dot instead of an icon. */
  dot?: boolean;
  className?: string;
  children: ReactNode;
}

/** Small static status label (role, trip status, payment source). */
export default function Badge({ tone = "neutral", icon: Icon, dot, className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-6 max-w-full items-center gap-1.5 whitespace-nowrap rounded-[5px] px-2 text-xs font-medium",
        toneClass[tone],
        className
      )}
    >
      {Icon ? <Icon aria-hidden="true" size={13} strokeWidth={1.75} className="shrink-0" /> : dot && <Dot tone={tone} />}
      <span className="ell">{children}</span>
    </span>
  );
}

interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** Toggle state; rendered as aria-pressed. */
  pressed?: boolean;
  icon?: LucideIcon;
  children: ReactNode;
}

/** 44px toggle chip for quick filters (mobile filter row, presets). */
export function Chip({ pressed = false, icon: Icon, className, children, type = "button", ...rest }: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={pressed}
      className={cn(
        "inline-flex h-11 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-control border px-3 text-sm",
        transition,
        focusRing,
        pressed
          ? "border-accent bg-accent-soft font-semibold text-accent"
          : "border-rule bg-surface text-ink hover:border-accent-line hover:bg-hover",
        className
      )}
      {...rest}
    >
      {Icon && (
        <Icon aria-hidden="true" size={15} strokeWidth={1.75} className={pressed ? undefined : "text-ink-3"} />
      )}
      {children}
    </button>
  );
}
