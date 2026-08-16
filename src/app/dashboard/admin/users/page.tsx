"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useTitle } from "@/hooks/useTitle";
import { useToast } from "@/components/ui/Toast";
import { InlineLoader } from "@/components/ui/Spinner";
import { ListPageSkeleton } from "@/components/ui/Skeleton";
import Spinner from "@/components/ui/Spinner";
import EmptyState from "@/components/ui/EmptyState";
import { Users, Shield, ShieldCheck, User as UserIcon, PieChartIcon, CreditCard } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis } from "recharts";
import { formatBaseCurrency } from "@/lib/currency";
import { PAYMENT_SOURCE_COLORS, PAYMENT_SOURCE_LABELS, useChartColors } from "@/components/dashboard/charts/chartTheme";

interface UserRecord {
  _id: string;
  email: string;
  name: string;
  role: "master_admin" | "admin" | "user";
  photoURL?: string;
  createdAt: string;
  totalSpend?: number;
  companySpend?: number;
  pocketSpend?: number;
}

const PIE_COLORS = ["#3b82f6", "#8b5cf6", "#ec4899", "#f43f5e", "#f97316", "#eab308", "#22c55e", "#14b8a6"];
const SOURCE_ROW_HEIGHT = 36;
const SOURCE_CHART_MIN_HEIGHT = 256;
const SOURCE_CHART_MAX_HEIGHT = 320;

export default function AdminUsersPage() {
  useTitle("Users");
  const { isAdmin, isMasterAdmin } = useAuth();
  const chartColors = useChartColors();
  const router = useRouter();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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

  const roleConfig = {
    master_admin: { label: "Master Admin", icon: ShieldCheck, color: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300" },
    admin: { label: "Admin", icon: Shield, color: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" },
    user: { label: "Member", icon: UserIcon, color: "bg-subtle text-muted" },
  };

  if (loading) return <ListPageSkeleton />;

  const pieData = users
    .filter((u) => u.totalSpend && u.totalSpend > 0)
    .map((u) => ({ id: u._id, name: u.name, value: u.totalSpend }))
    .sort((a, b) => (b.value || 0) - (a.value || 0));

  const sourceData = users
    .filter((u) => (u.companySpend || 0) + (u.pocketSpend || 0) > 0)
    .map((u) => ({
      id: u._id,
      name: u.name,
      company: u.companySpend || 0,
      pocket: u.pocketSpend || 0,
    }))
    .sort((a, b) => (b.company + b.pocket) - (a.company + a.pocket));

  const showBothCharts = pieData.length > 0 && sourceData.length > 0;
  const sourceChartHeight = Math.max(SOURCE_CHART_MIN_HEIGHT, sourceData.length * SOURCE_ROW_HEIGHT);

  const tooltipStyle = {
    borderRadius: "12px",
    backgroundColor: chartColors.tooltipBg,
    border: `1px solid ${chartColors.tooltipBorder}`,
    boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)",
    fontSize: "13px",
    color: chartColors.tooltipText,
    backdropFilter: "blur(12px)",
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">User Management</h1>
          <p className="text-sm text-muted-foreground">
            Manage user roles. {isMasterAdmin ? "Click a user's role badge to change it." : "Only the master admin can change roles."}
          </p>
        </div>
        {refreshing && <InlineLoader label="Refreshing..." />}
      </div>

      {users.length === 0 ? (
        <EmptyState
          icon={<Users className="h-8 w-8" />}
          title="No users yet"
          description="Users will appear here once they sign in."
        />
      ) : (
        <div className="space-y-6">
          {(pieData.length > 0 || sourceData.length > 0) && (
            <div className={showBothCharts ? "grid gap-6 lg:grid-cols-2" : ""}>
              {pieData.length > 0 && (
                <div className="card p-6">
                  <div className="mb-6 flex items-center gap-2">
                    <PieChartIcon className="h-5 w-5 text-muted-foreground" />
                    <h2 className="text-lg font-semibold text-foreground">Spend by User</h2>
                  </div>
                  <div className="flex flex-col items-center gap-6">
                    <div className="h-56 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pieData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={3}
                            stroke="none"
                            cornerRadius={4}
                          >
                            {pieData.map((entry, i) => (
                              <Cell
                                key={`cell-${entry.id}`}
                                fill={PIE_COLORS[i % PIE_COLORS.length]}
                                className="transition-all duration-300 hover:opacity-80"
                              />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={tooltipStyle}
                            itemStyle={{ color: chartColors.tooltipText, fontWeight: 600 }}
                            formatter={(value: any, name: any) => {
                              const numericValue = typeof value === "number" ? value : Number(value);
                              return [formatBaseCurrency(numericValue), name];
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="w-full max-h-48 overflow-y-auto pr-2">
                      <div className="flex flex-col space-y-3">
                        {pieData.map((entry, i) => (
                          <div key={entry.id} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <span
                                className="h-3 w-3 rounded-full shrink-0"
                                style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                              />
                              <span className="font-medium text-foreground truncate max-w-[180px]">{entry.name}</span>
                            </div>
                            <span className="font-semibold text-foreground whitespace-nowrap pl-2">
                              {formatBaseCurrency(entry.value || 0)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {sourceData.length > 0 && (
                <div className="card p-6">
                  <div className="mb-4 flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-muted-foreground" />
                    <h2 className="text-lg font-semibold text-foreground">Company vs Pocket</h2>
                  </div>
                  <div className="mb-4 flex flex-wrap items-center gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: PAYMENT_SOURCE_COLORS.company }} />
                      <span className="text-muted-foreground">{PAYMENT_SOURCE_LABELS.company}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: PAYMENT_SOURCE_COLORS.pocket }} />
                      <span className="text-muted-foreground">{PAYMENT_SOURCE_LABELS.pocket}</span>
                    </div>
                  </div>
                  <div
                    className="w-full overflow-y-auto"
                    style={{ maxHeight: SOURCE_CHART_MAX_HEIGHT }}
                  >
                    <div
                      style={{ height: sourceChartHeight }}
                      aria-label="Company versus pocket spend by user"
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={sourceData}
                          layout="vertical"
                          margin={{ top: 4, right: 12, left: 4, bottom: 0 }}
                        >
                          <XAxis
                            type="number"
                            tick={{ fontSize: 12, fill: chartColors.axis }}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(v: number) =>
                              v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `${v}`
                            }
                          />
                          <YAxis
                            type="category"
                            dataKey="id"
                            interval={0}
                            width={88}
                            tick={{ fontSize: 12, fill: chartColors.axis }}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(id: string) => {
                              const name = sourceData.find((row) => row.id === id)?.name ?? id;
                              return name.length > 12 ? `${name.slice(0, 11)}…` : name;
                            }}
                          />
                          <Tooltip
                            cursor={{ fill: chartColors.grid, opacity: 0.4 }}
                            contentStyle={tooltipStyle}
                            formatter={(value: any, name: any) => {
                              const numericValue = typeof value === "number" ? value : Number(value);
                              if (!numericValue) return null;
                              return [
                                formatBaseCurrency(numericValue),
                                name === "company" ? PAYMENT_SOURCE_LABELS.company : PAYMENT_SOURCE_LABELS.pocket,
                              ];
                            }}
                          />
                          <Bar dataKey="company" stackId="spend" fill={PAYMENT_SOURCE_COLORS.company} barSize={18} />
                          <Bar dataKey="pocket" stackId="spend" fill={PAYMENT_SOURCE_COLORS.pocket} barSize={18} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="card overflow-hidden">
            <div className="divide-y divide-line">
            {users.map((user) => {
              const config = roleConfig[user.role];
              const canManageRole = isMasterAdmin && user.role !== "master_admin";
              const nextRole = user.role === "admin" ? "user" : "admin";
              const actionLabel = user.role === "admin" ? "Remove Admin" : "Make Admin";
              const ActionIcon = user.role === "admin" ? UserIcon : Shield;
              return (
                <div
                  key={user._id}
                  className="flex items-center justify-between px-6 py-4 transition-colors hover:bg-subtle/50"
                >
                  <div className="flex items-center gap-4">
                    {user.photoURL ? (
                      <img
                        src={user.photoURL}
                        alt={user.name}
                        className="h-10 w-10 rounded-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-sm font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium text-foreground">{user.name}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${config.color}`}
                    >
                      <config.icon className="h-3.5 w-3.5" />
                      {config.label}
                    </span>

                    {canManageRole && (
                      <button
                        onClick={() => toggleRole(user)}
                        disabled={updatingId === user._id}
                        className={`inline-flex min-w-[7.5rem] items-center justify-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all ${
                          user.role === "admin"
                            ? "bg-subtle text-muted hover:bg-subtle-hover"
                            : "bg-brand-600 text-white hover:bg-brand-700"
                        } ${updatingId === user._id ? "cursor-wait opacity-70" : ""}`}
                        aria-label={`${actionLabel} for ${user.name}`}
                      >
                        {updatingId === user._id ? (
                          <Spinner
                            size="sm"
                            className={user.role === "admin" ? "border-muted-foreground border-t-transparent" : "border-white/40 border-t-white"}
                          />
                        ) : (
                          <ActionIcon className="h-3.5 w-3.5" />
                        )}
                        {updatingId === user._id ? `Updating to ${nextRole === "admin" ? "admin" : "member"}...` : actionLabel}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        </div>
      )}
    </div>
  );
}
