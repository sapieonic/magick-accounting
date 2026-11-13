import { cn } from "@/components/ui/cn";

interface BrandLogoProps {
  /** Hide the MagickVoice wordmark and show only the mark. */
  compact?: boolean;
  /** Light type for dark surfaces (the rail, the sign-in hero). */
  variant?: "default" | "onDark";
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE = {
  sm: { mark: "h-7 w-7", name: "text-sm", tagline: "text-[11px]" },
  md: { mark: "h-8 w-8", name: "text-[15px]", tagline: "text-xs" },
  lg: { mark: "h-11 w-11", name: "text-xl", tagline: "text-[13px]" },
};

export default function BrandLogo({ compact = false, variant = "default", size = "md", className }: BrandLogoProps) {
  const s = SIZE[size];
  const onDark = variant === "onDark";

  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      {/* On the dark rail the colourful mark sits on a light tile for contrast. */}
      <div
        className={cn(
          "flex shrink-0 items-center justify-center",
          s.mark,
          onDark && "rounded-md bg-white p-[3px]"
        )}
      >
        <img src="/logo.png" alt={compact ? "MagickVoice Accounting portal" : ""} className="h-full w-full object-contain" />
      </div>
      {!compact && (
        <div className="min-w-0 leading-tight">
          <p className={cn("whitespace-nowrap font-semibold tracking-[-0.01em]", s.name, onDark ? "text-white" : "text-ink")}>
            MagickVoice
          </p>
          <p className={cn("whitespace-nowrap", s.tagline, onDark ? "text-rail-muted" : "text-ink-3")}>
            Accounting portal
          </p>
        </div>
      )}
    </div>
  );
}
