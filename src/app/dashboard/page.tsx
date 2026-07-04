"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useTitle } from "@/hooks/useTitle";
import { api } from "@/lib/api";
import { DashboardSkeleton } from "@/components/ui/Skeleton";
import { Receipt, Building2, Tag, TrendingUp } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { formatCurrency, formatBaseCurrency } from "@/lib/currency";
import { motion, Variants } from "framer-motion";
import { StatCard } from "@/components/dashboard/StatCard";
import { InsightsHeader } from "@/components/dashboard/InsightsHeader";
import { MonthlyTrendCard } from "@/components/dashboard/charts/MonthlyTrendCard";
import { TopCategoriesCard } from "@/components/dashboard/charts/TopCategoriesCard";
import { DepartmentSpendCard } from "@/components/dashboard/charts/DepartmentSpendCard";
import { PaymentSourceCard } from "@/components/dashboard/charts/PaymentSourceCard";

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
  useTitle("Dashboard");
  const [stats, setStats] = useState<Stats | null>(null);
  const [charts, setCharts] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(true);

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
        <motion.div variants={itemVariants} className="lg:col-span-8">
          <MonthlyTrendCard
            data={charts?.monthlyTrend ?? []}
            onSelectMonth={(key) => router.push(`/dashboard/expenses?month=${key}`)}
          />
        </motion.div>

        {/* Top Categories - 4 cols */}
        <motion.div variants={itemVariants} className="lg:col-span-4">
          <TopCategoriesCard
            data={charts?.topCategories ?? []}
            onSelectCategory={openCategory}
          />
        </motion.div>

        {/* Department Spend - 8 cols */}
        <motion.div variants={itemVariants} className="lg:col-span-8">
          <DepartmentSpendCard data={charts?.departmentSpend ?? []} />
        </motion.div>

        {/* Payment Sources - 4 cols */}
        <motion.div variants={itemVariants} className="lg:col-span-4">
          <PaymentSourceCard data={charts?.paymentSources ?? []} />
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
