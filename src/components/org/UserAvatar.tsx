import { cn } from "@/components/ui/cn";

/** Up to two initials from a display name ("Asha Rao" → "AR"). */
export function initialsOf(name?: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? "").slice(0, 1);
  return letters.toUpperCase() || "?";
}

const SIZES = {
  sm: "h-6 w-6 text-[10px]",
  md: "h-9 w-9 text-xs",
} as const;

interface UserAvatarProps {
  name: string;
  photoURL?: string;
  size?: keyof typeof SIZES;
  /** amber for pocket-money contexts; accent otherwise. */
  tone?: "accent" | "amber";
  className?: string;
}

/** A person's photo, or their initials on a soft tint. Decorative: the name is always shown beside it. */
export default function UserAvatar({ name, photoURL, size = "md", tone = "accent", className }: UserAvatarProps) {
  const box = cn("shrink-0 rounded-full", SIZES[size], className);
  if (photoURL) {
    // eslint-disable-next-line @next/next/no-img-element -- remote Google avatars, no loader configured
    return <img src={photoURL} alt="" aria-hidden="true" referrerPolicy="no-referrer" className={cn(box, "object-cover")} />;
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        box,
        "inline-flex items-center justify-center font-semibold",
        tone === "amber" ? "bg-amber-soft text-amber" : "bg-accent-soft text-accent"
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
