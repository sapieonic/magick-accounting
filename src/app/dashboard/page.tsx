"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useTitle } from "@/hooks/useTitle";
import { api } from "@/lib/api";
import { DashboardSkeleton } from "@/components/ui/Skeleton";
import { Receipt, Building2, Tag, TrendingUp, ArrowUpRight, Sparkles, BarChart3, PieChart as PieChartIcon } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { formatCurrency, formatBaseCurrency } from "@/lib/currency";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";

interface Stats {
  totalExpenses: number;
  totalAmount: number;
  departmentCount: number;
  categoryCount: number;
  recentExpenses: Array<{
    _id: string;
    title: string;
    amount: number;
    amountInBaseCurrency?: number;
    currency?: { code: string; symbol: string; isBase: boolean };
    date: string;
    category: { name: string };
    department: { name: string };
  }>;
}

interface ChartData {
  monthlyTrend: Array<{ month: string; key: string; total: number; count: number }>;
  topCategories: Array<{ _id?: string | null; name: string; total: number; count: number }>;
}

const PIE_COLORS = [
  "#418a57", // forest (brand)
  "#dc9626", // brass
  "#6366f1", // indigo
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#a855f7", // purple
];

const CATEGORY_COLORS: Record<string, string> = {
  "Office Supplies": "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  "Travel": "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
  "Meals & Entertainment": "bg-pink-100 text-pink-700 dark:bg-pink-500/15 dark:text-pink-300",
  "Software & Subscriptions": "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  "Equipment & Hardware": "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300",
  "Marketing & Advertising": "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  "Professional Services": "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300",
  "Utilities": "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300",
  "Rent & Facilities": "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  "Training & Education": "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
  "Communication": "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
  "Insurance": "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  "Miscellaneous": "bg-subtle text-muted",
};

function getCategoryColor(name: string): string {
  return CATEGORY_COLORS[name] || "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300";
}

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { theme } = useTheme();
  useTitle("Dashboard");
  const [stats, setStats] = useState<Stats | null>(null);
  const [charts, setCharts] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(true);

  // Recharts renders raw SVG that can't read Tailwind dark: variants, so we
  // resolve the few colors it needs from the active theme here.
  const chartColors = useMemo(() => {
    const isDark = theme === "dark";
    return {
      grid: isDark ? "#272e29" : "#e6e4dc",
      axis: isDark ? "#7c867e" : "#8a948c",
      tooltipBg: isDark ? "#171c19" : "#ffffff",
      tooltipBorder: isDark ? "#3e4841" : "#e6e4dc",
      tooltipText: isDark ? "#f5f4ee" : "#1c201c",
      pieStroke: isDark ? "#171c19" : "#ffffff",
    };
  }, [theme]);

  useEffect(() => {
    async function load() {
      try {
        const [statsData, chartData] = await Promise.all([
          api.get("/api/dashboard/stats"),
          api.get("/api/dashboard/charts"),
        ]);
        setStats(statsData);
        setCharts(chartData);
      } catch {
        // Best-effort
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <DashboardSkeleton />;

  const openCategory = (categoryId?: string | null) => {
    router.push(categoryId ? `/dashboard/expenses?category=${categoryId}` : "/dashboard/expenses");
  };

  const hasTrendData = (charts?.monthlyTrend ?? []).some((m) => m.total > 0);
  const hasCategoryData = (charts?.topCategories ?? []).length > 0;
  const categoryTotal = (charts?.topCategories ?? []).reduce((sum, c) => sum + c.total, 0);

  const statCards = [
    {
      label: "Total Expenses",
      value: stats?.totalExpenses || 0,
      icon: Receipt,
      gradient: "from-blue-500 to-blue-600",
      bgGlow: "bg-blue-500/10",
      href: "/dashboard/expenses",
    },
    {
      label: "Total Amount",
      value: formatBaseCurrency(stats?.totalAmount || 0),
      icon: TrendingUp,
      gradient: "from-emerald-500 to-emerald-600",
      bgGlow: "bg-emerald-500/10",
      href: "/dashboard/expenses",
    },
    {
      label: "Departments",
      value: stats?.departmentCount || 0,
      icon: Building2,
      gradient: "from-violet-500 to-purple-600",
      bgGlow: "bg-violet-500/10",
      href: "/dashboard/departments",
    },
    {
      label: "Categories",
      value: stats?.categoryCount || 0,
      icon: Tag,
      gradient: "from-amber-500 to-orange-500",
      bgGlow: "bg-amber-500/10",
      href: "/dashboard/categories",
    },
  ];

  return (
    <div className="animate-fade-in space-y-6">
      {/* Welcome header with gradient accent */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-brand-900 via-brand-700 to-brand-600 px-6 py-8 text-white shadow-lg shadow-brand-900/25">
        <div className="bg-ledger-contrast absolute inset-0" />
        <div className="relative z-10">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-brand-200" />
            <p className="text-sm font-medium text-brand-100">Good to see you!</p>
          </div>
          <h1 className="mt-1 text-2xl font-bold">
            Welcome back, {user?.name?.split(" ")[0]}
          </h1>
          <p className="mt-1 text-sm text-white/70">Here&apos;s an overview of your expenses.</p>
        </div>
        {/* Background decoration */}
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
        <div className="absolute -bottom-6 -right-6 h-24 w-24 rounded-full bg-white/5" />
        <div className="absolute left-1/2 top-0 h-32 w-32 rounded-full bg-white/5" />
      </div>

      {/* Stat cards with gradient icons */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="group relative overflow-hidden rounded-xl border border-line bg-surface p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg dark:shadow-black/40"
          >
            <div className={`absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 ${card.bgGlow}`} />
            <div className="relative flex items-center gap-4">
              <div className={`rounded-xl bg-gradient-to-br ${card.gradient} p-3 text-white shadow-lg shadow-black/10`}>
                <card.icon className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{card.label}</p>
                <p className="mt-0.5 text-xl font-bold text-foreground">{card.value}</p>
              </div>
              <ArrowUpRight className="h-4 w-4 text-line-strong transition-all duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-muted-foreground" />
            </div>
          </Link>
        ))}
      </div>

      {/* Trend charts */}
      <div className="grid gap-4 lg:grid-cols-5">
        {/* Monthly trend */}
        <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm lg:col-span-3">
          <div className="flex items-center justify-between border-b border-line px-6 py-4">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 p-1.5 text-white">
                <BarChart3 className="h-4 w-4" />
              </div>
              <h2 className="text-base font-bold text-foreground">Monthly Trend</h2>
            </div>
            <p className="text-xs text-muted-foreground">Last 6 months &middot; click a month to filter</p>
          </div>
          <div className="px-2 pb-4 pt-4 sm:px-4">
            {hasTrendData ? (
              <div className="h-64 w-full cursor-pointer">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={charts?.monthlyTrend ?? []}
                    margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
    onClick={(state) => {
                      const idx = Number(state?.activeIndex);
                      const key = Number.isInteger(idx) ? charts?.monthlyTrend?.[idx]?.key : undefined;
                      if (key) router.push(`/dashboard/expenses?month=${key}`);
                    }}
                  >
                    <defs>
                      <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#418a57" stopOpacity={0.32} />
                        <stop offset="100%" stopColor="#418a57" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} vertical={false} />
                    <XAxis
                      dataKey="month"
                      stroke={chartColors.axis}
                      tick={{ fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke={chartColors.axis}
                      tick={{ fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: number) =>
                        v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `${v}`
                      }
                      width={48}
                    />
                    <Tooltip
                      cursor={{ stroke: chartColors.axis, strokeWidth: 1, strokeDasharray: "3 3" }}
                      contentStyle={{
                        borderRadius: 12,
                        backgroundColor: chartColors.tooltipBg,
                        border: `1px solid ${chartColors.tooltipBorder}`,
                        boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
                        fontSize: 12,
                        color: chartColors.tooltipText,
                      }}
                      formatter={((value: unknown, _name: unknown, item: { payload?: { count?: number } }) => {
                        const numericValue = typeof value === "number" ? value : Number(value);
                        const count = item?.payload?.count ?? 0;
                        return [
                          formatBaseCurrency(numericValue),
                          `Total (${count} ${count === 1 ? "expense" : "expenses"})`,
                        ];
                      }) as never}
                      labelStyle={{ fontWeight: 600, color: chartColors.tooltipText }}
                    />
                    <Area
                      type="monotone"
                      dataKey="total"
                      stroke="#418a57"
                      strokeWidth={2}
                      fill="url(#trendFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-64 flex-col items-center justify-center px-6 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-500/15 dark:to-indigo-500/15">
                  <BarChart3 className="h-5 w-5 text-blue-500 dark:text-blue-400" />
                </div>
                <p className="text-sm font-medium text-muted">No trend data yet</p>
                <p className="mt-1 text-xs text-muted-foreground">Add expenses to see your monthly trend.</p>
              </div>
            )}
          </div>
        </div>

        {/* Top categories */}
        <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between border-b border-line px-6 py-4">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-gradient-to-br from-amber-500 to-pink-500 p-1.5 text-white">
                <PieChartIcon className="h-4 w-4" />
              </div>
              <h2 className="text-base font-bold text-foreground">Top Categories</h2>
            </div>
            <p className="text-xs text-muted-foreground">Click to filter</p>
          </div>
          <div className="p-4">
            {hasCategoryData ? (
              <>
                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={charts?.topCategories ?? []}
                        dataKey="total"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={42}
                        outerRadius={72}
                        paddingAngle={2}
                        stroke={chartColors.pieStroke}
                        strokeWidth={2}
                        onClick={(_, index) => openCategory(charts?.topCategories?.[index]?._id)}
                      >
                        {(charts?.topCategories ?? []).map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} className="cursor-pointer" />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          borderRadius: 12,
                          backgroundColor: chartColors.tooltipBg,
                          border: `1px solid ${chartColors.tooltipBorder}`,
                          boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
                          fontSize: 12,
                          color: chartColors.tooltipText,
                        }}
                        formatter={((value: unknown) => {
                          const numericValue = typeof value === "number" ? value : Number(value);
                          return [formatBaseCurrency(numericValue), "Total"];
                        }) as never}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 space-y-1.5">
                  {(charts?.topCategories ?? []).map((c, i) => {
                    const pct = categoryTotal > 0 ? Math.round((c.total / categoryTotal) * 100) : 0;
                    return (
                      <button
                        key={c.name}
                        onClick={() => openCategory(c._id)}
                        className="flex w-full cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 text-left text-xs transition-colors hover:bg-subtle"
                      >
                        <span
                          className="h-2.5 w-2.5 flex-shrink-0 rounded-sm"
                          style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                        />
                        <span className="min-w-0 flex-1 truncate text-muted">{c.name}</span>
                        <span className="font-semibold tabular-nums text-foreground">
                          {formatBaseCurrency(c.total)}
                        </span>
                        <span className="w-9 text-right tabular-nums text-muted-foreground">{pct}%</span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="flex h-64 flex-col items-center justify-center px-6 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-amber-100 to-pink-100 dark:from-amber-500/15 dark:to-pink-500/15">
                  <PieChartIcon className="h-5 w-5 text-pink-500 dark:text-pink-400" />
                </div>
                <p className="text-sm font-medium text-muted">No category data</p>
                <p className="mt-1 text-xs text-muted-foreground">Add expenses to see your top categories.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent expenses */}
      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="text-base font-bold text-foreground">Recent Expenses</h2>
          <Link
            href="/dashboard/expenses"
            className="rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-600 transition-colors hover:bg-brand-100 dark:bg-brand-500/15 dark:text-brand-300 dark:hover:bg-brand-500/25"
          >
            View all
          </Link>
        </div>

        {stats?.recentExpenses?.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-brand-100 to-accent-100 dark:from-brand-500/15 dark:to-accent-500/15">
              <Receipt className="h-6 w-6 text-brand-500 dark:text-brand-400" />
            </div>
            <p className="text-sm font-medium text-muted">No expenses yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Create your first expense to get started!</p>
            <Link href="/dashboard/expenses/new" className="btn-primary mt-4 inline-flex text-sm">
              Add Expense
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-line">
            {stats?.recentExpenses?.map((expense, i) => (
              <Link
                key={expense._id}
                href={`/dashboard/expenses?expand=${expense._id}`}
                className="flex items-center gap-4 px-6 py-3.5 transition-colors hover:bg-subtle/50"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                {/* Category color dot */}
                <span
                  className={`inline-flex items-center rounded-lg px-2 py-1 text-[11px] font-semibold ${getCategoryColor(expense.category?.name)}`}
                >
                  {expense.category?.name}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{expense.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {expense.department?.name} &middot; {format(new Date(expense.date), "MMM d, yyyy")}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold tabular-nums text-foreground">
                    {formatCurrency(expense.amount, expense.currency?.code)}
                  </p>
                  {expense.currency && !expense.currency.isBase && expense.amountInBaseCurrency != null && (
                    <p className="text-[11px] tabular-nums text-muted-foreground">
                      {formatBaseCurrency(expense.amountInBaseCurrency)}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
