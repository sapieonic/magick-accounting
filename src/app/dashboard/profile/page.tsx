"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useTitle } from "@/hooks/useTitle";
import TelegramLinkCard from "@/components/profile/TelegramLinkCard";
import clsx from "clsx";

const ROLE_LABELS = {
  master_admin: { label: "Master Admin", color: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300" },
  admin: { label: "Admin", color: "bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" },
  user: { label: "Member", color: "bg-subtle text-muted" },
} as const;

export default function ProfilePage() {
  useTitle("Profile");
  const { user, isAdmin } = useAuth();
  if (!user) return null;
  const role = ROLE_LABELS[user.role];

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Profile</h1>
        <p className="text-sm text-muted-foreground">Your account and connected apps.</p>
      </div>

      <div className="card flex items-center gap-4 px-6 py-5">
        {user.photoURL ? (
          <img
            src={user.photoURL}
            alt={user.name}
            className="h-14 w-14 rounded-full border border-line object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-brand-100 to-brand-200 text-lg font-bold text-brand-700 dark:from-brand-500/20 dark:to-brand-500/30 dark:text-brand-300">
            {user.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate font-heading text-base font-bold text-foreground">{user.name}</p>
          <p className="truncate text-sm text-muted-foreground">{user.email}</p>
          <span className={clsx("mt-2 inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider", role.color)}>
            {role.label}
          </span>
        </div>
      </div>

      <TelegramLinkCard isAdmin={isAdmin} />
    </div>
  );
}
