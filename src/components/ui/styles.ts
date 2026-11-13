/**
 * Shared Ledger class strings. Primitives build on these so a page never
 * re-types a long class list: use the component when one exists, and these
 * helpers only for native elements (inputs, selects, plain links).
 */
import { cn } from "@/components/ui/cn";

/** Hover/press colour transition used by every interactive surface. */
export const transition = "transition-[background-color,border-color,color,box-shadow] duration-140 ease-out";

/** Visible focus ring for custom controls (native :focus-visible is global too). */
export const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/**
 * Form controls get the `control-line` border (>= 3:1, WCAG 1.4.11); hover raises contrast.
 * Focus is an opaque 2px accent ring outside the border, independent of the border colour, so it
 * still shows on an invalid (danger border) or auto-filled control.
 */
const control = cn(
  "rounded-control border border-control-line bg-surface text-sm text-ink placeholder:text-ink-3",
  "hover:border-accent-2 focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_rgb(var(--accent))]",
  "disabled:cursor-not-allowed disabled:bg-sunk disabled:text-ink-3",
  "aria-[invalid=true]:border-danger",
  transition
);

/** Text/number/date input, 44px tall. */
export const inputClass = cn(control, "h-11 w-full px-3");

/** Native select, 44px tall. */
export const selectClass = cn(control, "h-11 w-full cursor-pointer pl-3 pr-8");

/**
 * Narrow native select beside another control (the currency before an amount):
 * tighter padding and no `w-full`, so the caller sets its width.
 */
export const compactSelectClass = cn(control, "h-11 cursor-pointer pl-2 pr-6");

/** Multi-line textarea. */
export const textareaClass = cn(control, "min-h-[88px] w-full px-3 py-2.5 leading-normal");

/**
 * Fields that auto-fill set (AI extracted): tinted. The border stays `control-line`
 * (>= 3:1); the Field's "from receipt" aside says where the value came from.
 */
export const aiFilledClass = "!bg-tint";

/** Ledger list row: hairline top rule and hover tint. */
export const rowClass = cn("border-t border-rule-2 hover:bg-hover", transition);

/** Selected row: soft accent fill with a 3px inset indicator. */
export const rowSelectedClass = "!bg-accent-soft shadow-[inset_3px_0_0_rgb(var(--accent))]";

/** Inline text link in accent colour. */
export const linkClass = cn(
  "font-medium text-accent hover:text-ink",
  "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-accent",
  transition
);

/**
 * Link-styled `<button>` (or a link that acts like one): 40px hit area, 13px text, icon gap.
 * A ghost Button's ink text can't be recoloured (cn has no tailwind-merge), so use this instead.
 */
export const textButtonClass = cn(linkClass, "inline-flex min-h-10 items-center gap-1.5 rounded-control text-[13px]");

/** Small inline link with a 24px minimum target (WCAG 2.5.8). */
export const inlineLinkClass = cn(linkClass, "inline-flex min-h-6 items-center");

/** Side padding of a panel's head, body and footer; reuse it for edge-to-edge rows inside a flush panel. */
export const panelPadX = "px-[clamp(16px,2vw,24px)]";

/** Left side only of `panelPadX`, for rows whose trailing icon buttons sit closer to the edge. */
export const panelPadL = "pl-[clamp(16px,2vw,24px)]";

/** Ruled surface: 1px rule, 8px radius, no shadow. */
export const panelClass = "rounded-panel border border-rule bg-surface";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "ghost-danger";
export type ButtonSize = "sm" | "md";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent-hover",
  secondary: "border border-rule bg-surface text-ink hover:border-accent-line hover:bg-hover",
  ghost: "text-ink-2 hover:bg-tint-2 hover:text-ink",
  danger: "border border-rule bg-surface text-danger hover:border-danger/40 hover:bg-danger-soft",
  /** Quiet destructive control (delete icon in a row): ink until hovered. */
  "ghost-danger": "text-ink-2 hover:bg-danger-soft hover:text-danger",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-10 gap-1.5 px-3 text-[13px]",
  md: "h-11 gap-2 px-4 text-sm",
};

/** Class list for a Button; exported for the rare element that cannot be one. */
export function buttonClass({
  variant = "primary",
  size = "md",
  fullWidth = false,
}: { variant?: ButtonVariant; size?: ButtonSize; fullWidth?: boolean } = {}): string {
  return cn(
    "inline-flex shrink-0 cursor-pointer select-none items-center justify-center whitespace-nowrap rounded-control font-medium no-underline",
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    transition,
    focusRing,
    buttonVariants[variant],
    buttonSizes[size],
    fullWidth && "w-full"
  );
}

/** Square icon-only button. */
export function iconButtonClass({
  variant = "ghost",
  size = "md",
}: { variant?: ButtonVariant; size?: ButtonSize } = {}): string {
  return cn(
    "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-control",
    "disabled:pointer-events-none disabled:opacity-50",
    transition,
    focusRing,
    buttonVariants[variant],
    size === "sm" ? "h-10 w-10" : "h-11 w-11"
  );
}

/** lucide-react stroke width used across the app. */
export const ICON_STROKE = 1.75;
