import { cn } from "@/components/ui/cn";

/** Up to two initials, first and last word ("Asha Rao" → "AR"); "?" when there is no name. */
export function initials(name?: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

const SIZES = {
  24: "h-6 w-6 text-[10px]",
  28: "h-7 w-7 text-[10px]",
  32: "h-8 w-8 text-[11px]",
  36: "h-9 w-9 text-xs",
  56: "h-14 w-14 text-lg",
} as const;

const TONES = {
  accent: "bg-accent-soft text-accent",
  /** Pocket-money contexts. */
  amber: "bg-amber-soft text-amber",
  /** On the dark navigation rail. */
  rail: "bg-rail-line text-rail-ink",
} as const;

interface AvatarProps {
  name?: string | null;
  photoURL?: string | null;
  /** Diameter in px. Default 32. */
  size?: keyof typeof SIZES;
  tone?: keyof typeof TONES;
  /** Tooltip, e.g. the name when it is not printed beside the avatar. */
  title?: string;
  className?: string;
}

/**
 * A person's photo, or their initials on a soft tint. Decorative: show the
 * name beside it (or label the group, as TravelerAvatars does).
 */
export default function Avatar({ name, photoURL, size = 32, tone = "accent", title, className }: AvatarProps) {
  const box = cn("shrink-0 rounded-full", SIZES[size], className);
  if (photoURL) {
    // eslint-disable-next-line @next/next/no-img-element -- remote Google avatars, no loader configured
    return <img src={photoURL} alt="" aria-hidden="true" title={title} referrerPolicy="no-referrer" className={cn(box, "object-cover")} />;
  }
  return (
    <span
      aria-hidden="true"
      title={title}
      className={cn(box, "inline-flex items-center justify-center font-semibold", TONES[tone])}
    >
      {initials(name)}
    </span>
  );
}
