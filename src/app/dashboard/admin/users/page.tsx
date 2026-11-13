"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Shield, ShieldCheck, User as UserIcon, Users, type LucideIcon } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useTitle } from "@/hooks/useTitle";
import { useToast } from "@/components/ui/Toast";
import { InlineLoader } from "@/components/ui/Spinner";
import { ListPageSkeleton } from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import PageHeader from "@/components/ui/PageHeader";
import Panel from "@/components/ui/Panel";
import Badge, { type Tone } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { inputClass } from "@/components/ui/Field";
import { cn } from "@/components/ui/cn";
import { ICON_STROKE, rowClass } from "@/components/ui/styles";
import UserAvatar from "@/components/org/UserAvatar";
import UserSpendPanels from "@/components/org/UserSpendPanels";

type Role = "master_admin" | "admin" | "user";

interface UserRecord {
  _id: string;
  email: string;
  name: string;
  role: Role;
  photoURL?: string;
  createdAt: string;
  totalSpend?: number;
  companySpend?: number;
  pocketSpend?: number;
}

type RoleFilter = "all" | "admins" | "members";

const ROLE_BADGE: Record<Role, { label: string; icon: LucideIcon; tone: Tone }> = {
  master_admin: { label: "Master admin", icon: ShieldCheck, tone: "accent" },
  admin: { label: "Admin", icon: Shield, tone: "accent" },
  user: { label: "Member", icon: UserIcon, tone: "neutral" },
};

const isAdminRole = (role: Role) => role !== "user";

export default function AdminUsersPage() {
  useTitle("Users");
  const { isAdmin, isMasterAdmin } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");

  useEffect(() => {
    if (!isAdmin) {
      router.replace("/dashboard");
    }
  }, [isAdmin, router]);

  const loadUsers = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    try {
      const data = await api.get("/api/users");
      setUsers(data.users);
    } catch {
      toast("Failed to load users", "error");
    } finally {
      setLoading(false);
      if (showRefreshing) setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    if (isAdmin) loadUsers();
  }, [isAdmin, loadUsers]);

  const toggleRole = async (user: UserRecord) => {
    if (!isMasterAdmin || user.role === "master_admin") return;
    const newRole = user.role === "admin" ? "user" : "admin";
    setUpdatingId(user._id);
    try {
      await api.patch(`/api/users/${user._id}/role`, { role: newRole });
      toast(`${user.name} is now ${newRole === "admin" ? "an admin" : "a member"}`);
      await loadUsers(true);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to update role", "error");
    } finally {
      setUpdatingId(null);
    }
  };

  const adminCount = users.filter((u) => isAdminRole(u.role)).length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter === "admins" && !isAdminRole(u.role)) return false;
      if (roleFilter === "members" && isAdminRole(u.role)) return false;
      return !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    });
  }, [users, query, roleFilter]);

  if (loading) return <ListPageSkeleton />;

  const filtered = query.trim() !== "" || roleFilter !== "all";

  return (
    <div className="flex animate-fade-in flex-col gap-6">
      <PageHeader
        title="Users"
        meta={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {isMasterAdmin ? "Grant or remove admin access." : "Only the master admin can change roles."}
            {refreshing && <InlineLoader label="Refreshing..." />}
          </span>
        }
      />

      {users.length === 0 ? (
        <Panel>
          <EmptyState icon={<Users />} title="No users yet" description="Users will appear here once they sign in." />
        </Panel>
      ) : (
        <>
          <UserSpendPanels users={users} />

          <Panel
            title="People"
            meta={
              <span className="num">
                {users.length} · {adminCount} {adminCount === 1 ? "admin" : "admins"}
              </span>
            }
            flush
          >
            <div className="flex flex-wrap items-center gap-2 px-[clamp(16px,2vw,24px)] pb-3">
              <label className="relative min-w-0 flex-[1_1_240px]">
                <span className="sr-only">Search users</span>
                <Search
                  aria-hidden="true"
                  size={16}
                  strokeWidth={ICON_STROKE}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name or email"
                  className={cn(inputClass, "pl-9")}
                />
              </label>
              <SegmentedControl<RoleFilter>
                aria-label="Filter by role"
                value={roleFilter}
                onChange={setRoleFilter}
                options={[
                  { value: "all", label: "All" },
                  { value: "admins", label: "Admins" },
                  { value: "members", label: "Members" },
                ]}
              />
            </div>

            {visible.length === 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule-2 px-[clamp(16px,2vw,24px)] py-6 text-sm text-ink-3">
                No users match these filters.
                {filtered && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setQuery("");
                      setRoleFilter("all");
                    }}
                  >
                    Clear filters
                  </Button>
                )}
              </div>
            ) : (
              <ul aria-label="Users" className="flex flex-col">
                {visible.map((user) => {
                  const badge = ROLE_BADGE[user.role];
                  const canManageRole = isMasterAdmin && user.role !== "master_admin";
                  const updating = updatingId === user._id;
                  const nextRole = user.role === "admin" ? "member" : "admin";
                  const actionLabel = user.role === "admin" ? "Remove admin" : "Make admin";
                  return (
                    <li
                      key={user._id}
                      className={cn(
                        rowClass,
                        "flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 px-[clamp(16px,2vw,24px)] py-2.5"
                      )}
                    >
                      <span className="flex min-w-0 flex-[1_1_240px] items-center gap-3">
                        <UserAvatar name={user.name} photoURL={user.photoURL} />
                        <span className="flex min-w-0 flex-col">
                          <span className="ell font-medium text-ink">{user.name}</span>
                          <span className="ell text-[13px] text-ink-3">{user.email}</span>
                        </span>
                      </span>
                      <span className="ml-auto flex items-center gap-2">
                        <Badge tone={badge.tone} icon={badge.icon}>
                          {badge.label}
                        </Badge>
                        {canManageRole && (
                          <Button
                            size="sm"
                            variant={user.role === "admin" ? "secondary" : "primary"}
                            icon={user.role === "admin" ? UserIcon : Shield}
                            loading={updating}
                            onClick={() => toggleRole(user)}
                            aria-label={`${actionLabel} for ${user.name}`}
                            className="min-w-[8.5rem]"
                          >
                            {updating ? `Updating to ${nextRole}...` : actionLabel}
                          </Button>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
