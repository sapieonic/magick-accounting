import clsx from "clsx";

interface BrandLogoProps {
  /** Hide the MagickVoice wordmark and show only the mark. */
  compact?: boolean;
  /** Light type for dark surfaces such as the sign-in hero. */
  variant?: "default" | "onDark";
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE = {
  sm: {
    mark: "h-9 w-9",
    badge: "h-3.5 w-3.5 text-[8px] rounded-[5px] -bottom-px -right-px",
    name: "text-sm",
    tagline: "text-[10px]",
    gap: "gap-2.5",
  },
  md: {
    mark: "h-11 w-11",
    badge: "h-4 w-4 text-[9px] rounded-md -bottom-0.5 -right-0.5",
    name: "text-[15px]",
    tagline: "text-[11px]",
    gap: "gap-3",
  },
  lg: {
    mark: "h-12 w-12",
    badge: "h-[18px] w-[18px] text-[10px] rounded-md -bottom-0.5 -right-0.5",
    name: "text-xl",
    tagline: "text-xs",
    gap: "gap-4",
  },
};

export default function BrandLogo({
  compact = false,
  variant = "default",
  size = "md",
  className,
}: BrandLogoProps) {
  const s = SIZE[size];
  const onDark = variant === "onDark";

  return (
    <div className={clsx("flex min-w-0 items-center", s.gap, className)}>
      <div className={clsx("relative flex flex-shrink-0 items-center justify-center", s.mark)}>
        <img
          src="/logo.png"
          alt={compact ? "MagickVoice Accounting portal" : ""}
          className="h-full w-full object-contain"
        />
        <span
          aria-hidden
          className={clsx(
            "absolute flex items-center justify-center bg-gradient-to-br from-sky-300 to-cyan-400 font-bold leading-none text-white shadow-sm ring-1 ring-white/80",
            s.badge
          )}
        >
          $
        </span>
      </div>
      {!compact && (
        <div className="min-w-0 leading-tight">
          <p
            className={clsx(
              "font-heading truncate font-bold tracking-tight",
              s.name,
              onDark ? "text-white" : "text-foreground"
            )}
          >
            MagickVoice
          </p>
          <p
            className={clsx(
              "truncate font-medium",
              s.tagline,
              onDark ? "text-white/55" : "text-muted-foreground"
            )}
          >
            Accounting portal
          </p>
        </div>
      )}
    </div>
  );
}
