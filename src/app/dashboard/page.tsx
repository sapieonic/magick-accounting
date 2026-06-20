"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useTitle } from "@/hooks/useTitle";
import { api } from "@/lib/api";
import { DashboardSkeleton } from "@/components/ui/Skeleton";
import { Receipt, Building2, Tag, TrendingUp, BarChart3, PieChart as PieChartIcon, CreditCard } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { formatCurrency, formatBaseCurrency } from "@/lib/currency";
import { motion, Variants } from "framer-motion";
import { StatCard } from "@/components/dashboard/StatCard";
import { InsightsHeader } from "@/components/dashboard/InsightsHeader";
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
  BarChart,
  Bar,
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
  paymentSources: Array<{ name: string; total: number; count: number }>;
  departmentSpend: Array<{ _id?: string | null; name: string; total: number; count: number }>;
}

const PIE_COLORS = [
  "#6366f1", // indigo (brand)
  "#22d3ee", // cyan (accent)
  "#a855f7", // purple
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ec4899", // pink
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

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
};

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { theme } = useTheme();
  useTitle("Dashboard");
  const [stats, setStats] = useState<Stats | null>(null);
  const [charts, setCharts] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(true);

  const chartColors = useMemo(() => {
    const isDark = theme === "dark";
    return {
      grid: isDark ? "#27272a" : "#e2e8f0",
      axis: "#94a3b8",
      tooltipBg: isDark ? "rgba(24, 24, 27, 0.85)" : "rgba(255, 255, 255, 0.85)",
      tooltipBorder: isDark ? "#3f3f46" : "#e2e8f0",
      tooltipText: isDark ? "#fafafa" : "#0f172a",
      pieStroke: isDark ? "#18181b" : "#ffffff",
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
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="space-y-6 lg:space-y-8"
    >
      <motion.div variants={itemVariants}>
        <InsightsHeader userName={user?.name} />
      </motion.div>

      <motion.div
        variants={itemVariants}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {statCards.map((card) => (
          <StatCard key={card.label} {...card} />
        ))}
      </motion.div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Monthly Trend - 8 cols */}
        <motion.div variants={itemVariants} className="card flex flex-col lg:col-span-8">
          <div className="flex items-center justify-between border-b border-line px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 p-2 text-white shadow-sm">
                <BarChart3 className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-foreground">Monthly Trend</h2>
                <p className="text-xs text-muted-foreground">Last 6 months overview</p>
              </div>
            </div>
          </div>
          <div className="flex-1 p-4 sm:p-6">
            {hasTrendData ? (
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={charts?.monthlyTrend ?? []}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    onClick={(state: any) => {
                      const key = state?.activePayload?.[0]?.payload?.key;
                      if (key) router.push(`/dashboard/expenses?month=${key}`);
                    }}
                  >
                    <defs>
                      <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} vertical={false} />
                    <XAxis
                      dataKey="month"
                      stroke={chartColors.axis}
                      tick={{ fontSize: 12, fill: chartColors.axis }}
                      tickLine={false}
                      axisLine={false}
                      dy={10}
                    />
                    <YAxis
                      stroke={chartColors.axis}
                      tick={{ fontSize: 12, fill: chartColors.axis }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: number) =>
                        v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `${v}`
                      }
                    />
                    <Tooltip
                      cursor={{ stroke: chartColors.axis, strokeWidth: 1, strokeDasharray: "4 4" }}
                      contentStyle={{
                        borderRadius: "16px",
                        backgroundColor: chartColors.tooltipBg,
                        border: `1px solid ${chartColors.tooltipBorder}`,
                        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)",
                        fontSize: "13px",
                        color: chartColors.tooltipText,
                        backdropFilter: "blur(12px)",
                      }}
                      formatter={(value: any, _name: any, item: any) => {
                        const numericValue = typeof value === "number" ? value : Number(value);
                        const count = item?.payload?.count ?? 0;
                        return [
                          <span key="val" className="font-bold">{formatBaseCurrency(numericValue)}</span>,
                          <span key="count" className="text-muted-foreground">{count} expenses</span>,
                        ];
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="total"
                      stroke="#6366f1"
                      strokeWidth={3}
                      fill="url(#trendFill)"
                      activeDot={{ r: 6, strokeWidth: 0, fill: "#6366f1" }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-500/20 dark:to-indigo-500/20">
                  <BarChart3 className="h-6 w-6 text-blue-500 dark:text-blue-400" />
                </div>
                <p className="text-sm font-semibold text-foreground">No trend data yet</p>
                <p className="mt-1 text-sm text-muted-foreground">Add your first expense to generate insights.</p>
              </div>
            )}
          </div>
        </motion.div>

        {/* Top Categories - 4 cols */}
        <motion.div variants={itemVariants} className="card flex flex-col lg:col-span-4">
          <div className="flex items-center justify-between border-b border-line px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-gradient-to-br from-amber-500 to-pink-500 p-2 text-white shadow-sm">
                <PieChartIcon className="h-4 w-4" />
              </div>
              <h2 className="text-base font-bold text-foreground">Top Categories</h2>
            </div>
          </div>
          <div className="flex-1 p-6">
            {hasCategoryData ? (
              <div className="flex h-full flex-col">
                <div className="relative h-48 w-full">
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total</span>
                    <span className="font-display text-xl font-bold text-foreground">
                      {formatBaseCurrency(categoryTotal)}
                    </span>
                  </div>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={charts?.topCategories ?? []}
                        dataKey="total"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={65}
                        outerRadius={85}
                        paddingAngle={3}
                        stroke={chartColors.pieStroke}
                        strokeWidth={2}
                        cornerRadius={4}
                        onClick={(entry: any) => openCategory(entry?.payload?._id || entry?._id)}
                      >
                        {(charts?.topCategories ?? []).map((_, i) => (
                          <Cell
                            key={i}
                            fill={PIE_COLORS[i % PIE_COLORS.length]}
                            className="cursor-pointer transition-all duration-300 hover:opacity-80"
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          borderRadius: "12px",
                          backgroundColor: chartColors.tooltipBg,
                          border: `1px solid ${chartColors.tooltipBorder}`,
                          boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)",
                          fontSize: "13px",
                          color: chartColors.tooltipText,
                          backdropFilter: "blur(12px)",
                        }}
                        formatter={(value: any) => {
                          const numericValue = typeof value === "number" ? value : Number(value);
                          return [<span key="val" className="font-bold">{formatBaseCurrency(numericValue)}</span>, ""];
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-6 flex-1 space-y-2 overflow-y-auto pr-2">
                  {(charts?.topCategories ?? []).map((c, i) => {
                    return (
                      <button
                        key={c.name}
                        onClick={() => openCategory(c._id)}
                        className="group flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-subtle"
                      >
                        <span
                          className="h-3 w-3 flex-shrink-0 rounded-full"
                          style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                        />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-muted-foreground group-hover:text-foreground">
                          {c.name}
                        </span>
                        <span className="font-display text-sm font-bold tabular-nums text-foreground">
                          {formatBaseCurrency(c.total)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-100 to-pink-100 dark:from-amber-500/20 dark:to-pink-500/20">
                  <PieChartIcon className="h-6 w-6 text-pink-500 dark:text-pink-400" />
                </div>
                <p className="text-sm font-semibold text-foreground">No category data</p>
                <p className="mt-1 text-sm text-muted-foreground">Your top categories will appear here.</p>
              </div>
            )}
          </div>
        </motion.div>

        {/* Department Spend - 8 cols */}
        <motion.div variants={itemVariants} className="card flex flex-col lg:col-span-8">
          <div className="flex items-center justify-between border-b border-line px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 p-2 text-white shadow-sm">
                <Building2 className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-foreground">Department Spend</h2>
                <p className="text-xs text-muted-foreground">Top spending departments</p>
              </div>
            </div>
          </div>
          <div className="flex-1 p-4 sm:p-6">
            {(charts?.departmentSpend ?? []).length > 0 ? (
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={charts?.departmentSpend ?? []}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} vertical={false} />
                    <XAxis
                      dataKey="name"
                      stroke={chartColors.axis}
                      tick={{ fontSize: 12, fill: chartColors.axis }}
                      tickLine={false}
                      axisLine={false}
                      dy={10}
                    />
                    <YAxis
                      stroke={chartColors.axis}
                      tick={{ fontSize: 12, fill: chartColors.axis }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: number) =>
                        v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `${v}`
                      }
                    />
                    <Tooltip
                      cursor={{ fill: chartColors.grid, opacity: 0.4 }}
                      contentStyle={{
                        borderRadius: "16px",
                        backgroundColor: chartColors.tooltipBg,
                        border: `1px solid ${chartColors.tooltipBorder}`,
                        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)",
                        fontSize: "13px",
                        color: chartColors.tooltipText,
                        backdropFilter: "blur(12px)",
                      }}
                      formatter={(value: any, _name: any, item: any) => {
                        const numericValue = typeof value === "number" ? value : Number(value);
                        const count = item?.payload?.count ?? 0;
                        return [
                          <span key="val" className="font-bold">{formatBaseCurrency(numericValue)}</span>,
                          <span key="count" className="text-muted-foreground">{count} expenses</span>,
                        ];
                      }}
                    />
                    <Bar
                      dataKey="total"
                      fill="#8b5cf6"
                      radius={[6, 6, 0, 0]}
                      barSize={40}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-100 to-fuchsia-100 dark:from-violet-500/20 dark:to-fuchsia-500/20">
                  <Building2 className="h-6 w-6 text-violet-500 dark:text-violet-400" />
                </div>
                <p className="text-sm font-semibold text-foreground">No department data</p>
              </div>
            )}
          </div>
        </motion.div>

        {/* Payment Sources - 4 cols */}
        <motion.div variants={itemVariants} className="card flex flex-col lg:col-span-4">
          <div className="flex items-center justify-between border-b border-line px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 p-2 text-white shadow-sm">
                <CreditCard className="h-4 w-4" />
              </div>
              <h2 className="text-base font-bold text-foreground">Payment Source</h2>
            </div>
          </div>
          <div className="flex-1 p-6">
            {(charts?.paymentSources ?? []).length > 0 ? (
              <div className="flex h-full flex-col">
                <div className="relative h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={charts?.paymentSources ?? []}
                        dataKey="total"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={3}
                        stroke={chartColors.pieStroke}
                        strokeWidth={2}
                        cornerRadius={4}
                      >
                        {(charts?.paymentSources ?? []).map((entry, i) => (
                          <Cell
                            key={i}
                            fill={entry.name === "company" ? "#10b981" : "#f59e0b"}
                            className="transition-all duration-300 hover:opacity-80"
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          borderRadius: "12px",
                          backgroundColor: chartColors.tooltipBg,
                          border: `1px solid ${chartColors.tooltipBorder}`,
                          boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)",
                          fontSize: "13px",
                          color: chartColors.tooltipText,
                          backdropFilter: "blur(12px)",
                        }}
                        formatter={(value: any, _name: any, item: any) => {
                          const numericValue = typeof value === "number" ? value : Number(value);
                          return [<span key="val" className="font-bold">{formatBaseCurrency(numericValue)}</span>, item.payload.name === "company" ? "Company Card" : "Out of Pocket"];
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-6 flex-1 space-y-3 pr-2">
                  {(charts?.paymentSources ?? []).map((c) => {
                    const isCompany = c.name === "company";
                    return (
                      <div
                        key={c.name}
                        className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5"
                      >
                        <span
                          className="h-3 w-3 flex-shrink-0 rounded-full"
                          style={{ background: isCompany ? "#10b981" : "#f59e0b" }}
                        />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-muted-foreground">
                          {isCompany ? "Company Card" : "Out of Pocket"}
                        </span>
                        <span className="font-display text-sm font-bold tabular-nums text-foreground">
                          {formatBaseCurrency(c.total)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-500/20 dark:to-teal-500/20">
                  <CreditCard className="h-6 w-6 text-emerald-500 dark:text-emerald-400" />
                </div>
                <p className="text-sm font-semibold text-foreground">No payment data</p>
              </div>
            )}
          </div>
        </motion.div>

        {/* Recent Expenses - 12 cols */}
        <motion.div variants={itemVariants} className="card lg:col-span-12">
          <div className="flex items-center justify-between border-b border-line px-6 py-5">
            <h2 className="text-base font-bold text-foreground">Recent Expenses</h2>
            <Link
              href="/dashboard/expenses"
              className="group flex items-center gap-1 rounded-lg bg-subtle px-3 py-1.5 text-xs font-semibold text-foreground transition-all hover:bg-line"
            >
              View all <span className="transition-transform group-hover:translate-x-0.5">&rarr;</span>
            </Link>
          </div>

          {stats?.recentExpenses?.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-100 to-accent-100 dark:from-brand-500/20 dark:to-accent-500/20">
                <Receipt className="h-8 w-8 text-brand-500 dark:text-brand-400" />
              </div>
              <p className="text-base font-semibold text-foreground">No expenses yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Create your first expense to get started!</p>
              <Link href="/dashboard/expenses/new" className="btn-primary mt-5">
                Add Expense
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-line">
              {stats?.recentExpenses?.map((expense) => (
                <Link
                  key={expense._id}
                  href={`/dashboard/expenses?expand=${expense._id}`}
                  className="group flex items-center gap-4 px-6 py-4 transition-all hover:bg-subtle/50"
                >
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${getCategoryColor(
                      expense.category?.name
                    )}`}
                  >
                    <Receipt className="h-5 w-5 opacity-70" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground transition-colors group-hover:text-brand-500 dark:group-hover:text-brand-400">
                      {expense.title}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="font-medium text-muted">{expense.department?.name}</span>
                      <span>&bull;</span>
                      <span>{format(new Date(expense.date), "MMM d, yyyy")}</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-base font-bold tabular-nums text-foreground">
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
        </motion.div>
      </div>
    </motion.div>
  );
}
