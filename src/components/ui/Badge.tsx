import type { ButtonHTMLAttributes, ReactNode } from "react";
import { X, type LucideIcon } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { focusRing, transition, ICON_STROKE } from "@/components/ui/styles";

/** Badge tones. No accent: the accent marks actions and selection, never a status. */
export type Tone = "neutral" | "amber" | "success" | "danger";

/** Dots also mark the company share of a split (the accent). */
export type DotTone = Tone | "accent";

const toneClass: Record<Tone, string> = {
  neutral: "bg-sunk text-ink-2",
  amber: "bg-amber-soft text-amber",
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
};

const dotClass: Record<DotTone, string> = {
  neutral: "bg-ink-3",
  accent: "bg-accent",
  amber: "bg-pocket",
  success: "bg-success",
  danger: "bg-danger",
};

/** 7px status dot in a tone's colour (company = accent, pocket = amber). */
export function Dot({ tone = "neutral", className }: { tone?: DotTone; className?: string }) {
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
        "inline-flex h-6 max-w-full items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-xs font-medium",
        toneClass[tone],
        className
      )}
    >
      {Icon ? <Icon aria-hidden="true" size={13} strokeWidth={ICON_STROKE} className="shrink-0" /> : dot && <Dot tone={tone} />}
      <span className="ell">{children}</span>
    </span>
  );
}

interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** Toggle state: aria-pressed, or aria-checked with `role="radio"` (inside a radiogroup). */
  pressed?: boolean;
  icon?: LucideIcon;
  children: ReactNode;
}

/** 44px toggle chip for quick filters (mobile filter row, presets) or one option of a radiogroup. */
export function Chip({ pressed = false, icon: Icon, className, children, type = "button", ...rest }: ChipProps) {
  const radio = rest.role === "radio";
  return (
    <button
      type={type}
      aria-pressed={radio ? undefined : pressed}
      aria-checked={radio ? pressed : undefined}
      className={cn(
        "inline-flex h-11 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-control border px-3 text-sm",
        "disabled:cursor-not-allowed disabled:opacity-50",
        transition,
        focusRing,
        pressed
          ? "border-accent bg-accent-soft font-medium text-accent"
          : "border-control-line bg-surface text-ink hover:border-ink-3 hover:bg-hover",
        className
      )}
      {...rest}
    >
      {Icon && (
        <Icon aria-hidden="true" size={15} strokeWidth={ICON_STROKE} className={pressed ? undefined : "text-ink-3"} />
      )}
      {children}
    </button>
  );
}

interface RemovableChipProps {
  /** Removes the value (an active filter, a picked place or person). */
  onRemove: () => void;
  /** Accessible name, e.g. "Remove Pune"; default: the label + "(remove)". */
  removeLabel?: string;
  children: ReactNode;
}

/** A picked value shown as an accent chip; the whole chip is the remove button. */
export function RemovableChip({ onRemove, removeLabel, children }: RemovableChipProps) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={removeLabel}
      title={removeLabel}
      className={cn(
        "inline-flex h-10 max-w-full cursor-pointer items-center gap-1.5 rounded-control border border-accent-line bg-accent-soft pl-3 pr-2 text-[13px] font-medium text-accent hover:bg-tint-2",
        transition,
        focusRing
      )}
    >
      <span className="ell">{children}</span>
      <X aria-hidden="true" size={14} strokeWidth={ICON_STROKE} className="shrink-0" />
      {!removeLabel && <span className="sr-only">(remove)</span>}
    </button>
  );
}
