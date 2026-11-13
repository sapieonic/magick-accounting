import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/components/ui/cn";
import Spinner from "@/components/ui/Spinner";
import {
  ICON_STROKE,
  buttonClass,
  iconButtonClass,
  type ButtonSize,
  type ButtonVariant,
} from "@/components/ui/styles";

interface ButtonOwnProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading lucide icon. */
  icon?: LucideIcon;
  /** Trailing lucide icon. */
  iconRight?: LucideIcon;
  /** Shows a spinner in place of the icon and disables the button. */
  loading?: boolean;
  fullWidth?: boolean;
  className?: string;
  children?: ReactNode;
}

type AsButton = ButtonOwnProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof ButtonOwnProps> & { href?: undefined };
type AsLink = ButtonOwnProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof ButtonOwnProps | "href"> & { href: string };

export type ButtonProps = AsButton | AsLink;

/** The button's own aria-busy says it's loading, so the ring is decorative. */
function ButtonSpinner() {
  return <Spinner size="sm" tone="current" decorative />;
}

function iconSize(size: ButtonSize) {
  return size === "sm" ? 15 : 16;
}

/** Ledger button; renders a next/link when `href` is given. */
export default function Button(props: ButtonProps) {
  const {
    variant = "primary",
    size = "md",
    icon: Icon,
    iconRight: IconRight,
    loading = false,
    fullWidth,
    className,
    children,
    ...rest
  } = props;
  const px = iconSize(size);
  const content = (
    <>
      {loading ? (
        <ButtonSpinner />
      ) : (
        Icon && <Icon aria-hidden="true" size={px} strokeWidth={ICON_STROKE} className="shrink-0" />
      )}
      {children}
      {IconRight && <IconRight aria-hidden="true" size={px} strokeWidth={ICON_STROKE} className="shrink-0" />}
    </>
  );
  const classes = cn(buttonClass({ variant, size, fullWidth }), className);

  if (rest.href !== undefined) {
    const { href, ...anchor } = rest as Omit<AsLink, keyof ButtonOwnProps>;
    return (
      <Link href={href} className={classes} {...anchor}>
        {content}
      </Link>
    );
  }

  const { type = "button", disabled, ...button } = rest as Omit<AsButton, keyof ButtonOwnProps>;
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={classes}
      {...button}
    >
      {content}
    </button>
  );
}

interface IconButtonOwnProps {
  icon: LucideIcon;
  /** Required: icon-only controls need an accessible name. */
  "aria-label": string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner in place of the icon and disables the button. */
  loading?: boolean;
  className?: string;
}

type IconAsButton = IconButtonOwnProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof IconButtonOwnProps | "children"> & {
    href?: undefined;
  };
type IconAsLink = IconButtonOwnProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof IconButtonOwnProps | "href" | "children"> & {
    href: string;
  };

export type IconButtonProps = IconAsButton | IconAsLink;

/** 40/44px square icon-only button (ghost by default). Shows its label as a tooltip. */
export function IconButton(props: IconButtonProps) {
  const { icon: Icon, variant = "ghost", size = "md", loading = false, className, ...rest } = props;
  const classes = cn(iconButtonClass({ variant, size }), className);
  const glyph = loading ? (
    <ButtonSpinner />
  ) : (
    <Icon aria-hidden="true" size={size === "sm" ? 18 : 20} strokeWidth={ICON_STROKE} />
  );
  const title = rest.title ?? rest["aria-label"];

  if (rest.href !== undefined) {
    const { href, ...anchor } = rest as Omit<IconAsLink, "icon" | "variant" | "size" | "loading" | "className">;
    return (
      <Link href={href} className={classes} title={title} {...anchor}>
        {glyph}
      </Link>
    );
  }

  const { type = "button", disabled, ...button } = rest as Omit<IconAsButton, "icon" | "variant" | "size" | "loading" | "className">;
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={classes}
      title={title}
      {...button}
    >
      {glyph}
    </button>
  );
}
