import { cn } from "@/components/ui/cn";

/** Up to two initials from a display name ("Asha Rao" -> "AR"). */
export function initials(name?: string): string {
  return (name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

interface ProfileAvatarProps {
  name: string;
  photoURL?: string;
  className?: string;
}

/** Round avatar: the Google photo when there is one, else initials on indigo. */
export default function ProfileAvatar({ name, photoURL, className }: ProfileAvatarProps) {
  const base = cn("h-14 w-14 shrink-0 rounded-full", className);
  if (photoURL) {
    return <img src={photoURL} alt="" className={cn(base, "border border-rule object-cover")} referrerPolicy="no-referrer" />;
  }
  return (
    <span
      aria-hidden="true"
      className={cn(base, "flex items-center justify-center bg-accent-soft text-lg font-semibold text-accent")}
    >
      {initials(name) || "?"}
    </span>
  );
}
