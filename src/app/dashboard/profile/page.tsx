"use client";

import type { ReactNode } from "react";
import { Moon, Sun } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme, type Theme } from "@/contexts/ThemeContext";
import { useTitle } from "@/hooks/useTitle";
import PageHeader from "@/components/ui/PageHeader";
import Panel, { PanelGrid } from "@/components/ui/Panel";
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

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] items-baseline gap-3 border-t border-rule-2 py-3 first:border-t-0 first:pt-0">
      <dt className="cap text-ink-3">{label}</dt>
      <dd className="min-w-0 break-words text-sm text-ink">{children}</dd>
    </div>
  );
}

export default function ProfilePage() {
  useTitle("Profile");
  const { user, isAdmin } = useAuth();
  const { theme, setTheme } = useTheme();
  if (!user) return null;
  const role = ROLES[user.role];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Avatar name={user.name} photoURL={user.photoURL} size={56} />
        <PageHeader
          className="min-w-0 flex-1"
          eyebrow="Profile"
          title={user.name}
          meta={<span className="ell block">{user.email}</span>}
        />
      </div>

      <PanelGrid min={340}>
        <Panel title="Account" grow={2}>
          <dl>
            <DetailRow label="Name">{user.name}</DetailRow>
            <DetailRow label="Email">{user.email}</DetailRow>
            <DetailRow label="Role">
              <span className="flex flex-col items-start gap-1.5">
                <Badge tone={role.tone}>{role.label}</Badge>
                <span className="text-[13px] text-ink-3">{role.note}</span>
              </span>
            </DetailRow>
            <DetailRow label="Sign-in">Google account</DetailRow>
          </dl>
        </Panel>
        <Panel title="Appearance" meta="Saved on this device">
          <SegmentedControl aria-label="Theme" options={THEMES} value={theme} onChange={setTheme} fullWidth />
        </Panel>
      </PanelGrid>

      <TelegramLinkCard isAdmin={isAdmin} />
    </div>
  );
}
