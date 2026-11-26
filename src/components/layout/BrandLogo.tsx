import { cn } from "@/components/ui/cn";

interface BrandLogoProps {
  /** Hide the MagickVoice wordmark and show only the mark. */
  compact?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE = {
  sm: { mark: "h-7 w-7", name: "text-sm", tagline: "text-xs" },
  md: { mark: "h-8 w-8", name: "text-[15px]", tagline: "text-xs" },
  lg: { mark: "h-11 w-11", name: "text-xl", tagline: "text-[13px]" },
};

/** The brand mark plus wordmark, in the ink tokens (inside a `.dark` scope they turn light on their own). */
export default function BrandLogo({ compact = false, size = "md", className }: BrandLogoProps) {
  const s = SIZE[size];

  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <img
        src="/logo.png"
        alt={compact ? "MagickVoice Accounting portal" : ""}
        className={cn("shrink-0 object-contain", s.mark)}
      />
      {!compact && (
        <div className="min-w-0 leading-tight">
          <p className={cn("whitespace-nowrap font-medium text-ink", s.name)}>
            MagickVoice
          </p>
          <p className={cn("whitespace-nowrap text-ink-3", s.tagline)}>
            Accounting portal
          </p>
        </div>
      )}
    </div>
  );
}
