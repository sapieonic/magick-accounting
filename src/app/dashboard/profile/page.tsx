"use client";

import { Moon, Sun } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme, type Theme } from "@/contexts/ThemeContext";
import { useTitle } from "@/hooks/useTitle";
import PageHeader from "@/components/ui/PageHeader";
import Panel from "@/components/ui/Panel";
import DetailList from "@/components/ui/DetailList";
import Badge, { type Tone } from "@/components/ui/Badge";
import SegmentedControl from "@/components/ui/SegmentedControl";
import Avatar from "@/components/ui/Avatar";
import TelegramLinkCard from "@/components/profile/TelegramLinkCard";

const ROLES: Record<"master_admin" | "admin" | "user", { label: string; tone: Tone; note: string }> = {
  master_admin: {
    label: "Master admin",
    tone: "accent",
    note: "Sees every expense, has the admin pages and can change people's roles.",
  },
  admin: { label: "Admin", tone: "accent", note: "Sees every expense and has the admin pages: invoices, users and settings." },
  user: { label: "Member", tone: "neutral", note: "Sees and manages the expenses you submit." },
};

const THEMES = [
  { value: "light" as Theme, label: "Light", icon: Sun },
  { value: "dark" as Theme, label: "Dark", icon: Moon },
];

export default function ProfilePage() {
  useTitle("Profile");
  const { user, isAdmin } = useAuth();
  const { theme, setTheme } = useTheme();
  if (!user) return null;
  const role = ROLES[user.role];

  return (
    <div className="flex animate-fade-in flex-col gap-6">
      <div className="flex items-center gap-4">
        <Avatar name={user.name} photoURL={user.photoURL} size={56} />
        <PageHeader
          className="min-w-0 flex-1"
          eyebrow="Profile"
          title={user.name}
          meta={<span className="ell block">{user.email}</span>}
        />
      </div>

      {/* Appearance is one row of the account, not a mostly empty panel of its own. */}
      <Panel title="Account">
        <DetailList
          layout="columns"
          items={[
            { label: "Name", value: user.name },
            { label: "Email", value: user.email },
            {
              label: "Role",
              value: (
                <span className="flex flex-col items-start gap-1.5">
                  <Badge tone={role.tone}>{role.label}</Badge>
                  <span className="text-[13px] text-ink-3">{role.note}</span>
                </span>
              ),
            },
            { label: "Sign-in", value: "Google account" },
            {
              label: "Theme",
              value: (
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <SegmentedControl aria-label="Theme" options={THEMES} value={theme} onChange={setTheme} size="sm" />
                  <span className="text-[13px] text-ink-3">Saved on this device</span>
                </span>
              ),
            },
          ]}
        />
      </Panel>

      <TelegramLinkCard isAdmin={isAdmin} />
    </div>
  );
}
