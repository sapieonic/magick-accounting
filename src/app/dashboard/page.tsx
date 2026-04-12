"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTitle } from "@/hooks/useTitle";
import { api } from "@/lib/api";
import { PageLoader } from "@/components/ui/Spinner";
import { Receipt, Building2, Tag, TrendingUp, ArrowUpRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { formatCurrency, formatBaseCurrency } from "@/lib/currency";

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

const CATEGORY_COLORS: Record<string, string> = {
  "Office Supplies": "bg-sky-100 text-sky-700",
  "Travel": "bg-orange-100 text-orange-700",
  "Meals & Entertainment": "bg-pink-100 text-pink-700",
  "Software & Subscriptions": "bg-violet-100 text-violet-700",
  "Equipment & Hardware": "bg-slate-100 text-slate-700",
  "Marketing & Advertising": "bg-rose-100 text-rose-700",
  "Professional Services": "bg-cyan-100 text-cyan-700",
  "Utilities": "bg-yellow-100 text-yellow-700",
  "Rent & Facilities": "bg-emerald-100 text-emerald-700",
  "Training & Education": "bg-indigo-100 text-indigo-700",
  "Communication": "bg-teal-100 text-teal-700",
  "Insurance": "bg-amber-100 text-amber-700",
  "Miscellaneous": "bg-gray-100 text-gray-600",
};

function getCategoryColor(name: string): string {
  return CATEGORY_COLORS[name] || "bg-blue-100 text-blue-700";
}

export default function DashboardPage() {
  const { user } = useAuth();
  useTitle("Dashboard");
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        const [expensesData, deptData, catData] = await Promise.all([
          api.get("/api/expenses?limit=5"),
          api.get("/api/departments"),
          api.get("/api/categories"),
        ]);

        const allExpenses = await api.get("/api/expenses?limit=1000");
        const totalAmount = allExpenses.expenses.reduce(
          (sum: number, e: { amountInBaseCurrency?: number; amount: number }) =>
            sum + (e.amountInBaseCurrency ?? e.amount),
          0
        );

        setStats({
          totalExpenses: allExpenses.pagination.total,
          totalAmount,
          departmentCount: deptData.departments.length,
          categoryCount: catData.categories.length,
          recentExpenses: expensesData.expenses,
        });
      } catch {
        // Stats loading is best-effort
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  if (loading) return <PageLoader />;

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
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-brand-600 via-brand-500 to-indigo-500 px-6 py-8 text-white shadow-lg shadow-brand-500/20">
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
            className="group relative overflow-hidden rounded-xl border border-gray-100 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
          >
            <div className={`absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 ${card.bgGlow}`} />
            <div className="relative flex items-center gap-4">
              <div className={`rounded-xl bg-gradient-to-br ${card.gradient} p-3 text-white shadow-lg shadow-black/10`}>
                <card.icon className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{card.label}</p>
                <p className="mt-0.5 text-xl font-bold text-gray-900">{card.value}</p>
              </div>
              <ArrowUpRight className="h-4 w-4 text-gray-300 transition-all duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-gray-500" />
            </div>
          </Link>
        ))}
      </div>

      {/* Recent expenses */}
      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-bold text-gray-900">Recent Expenses</h2>
          <Link
            href="/dashboard/expenses"
            className="rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-600 transition-colors hover:bg-brand-100"
          >
            View all
          </Link>
        </div>

        {stats?.recentExpenses?.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-brand-100 to-indigo-100">
              <Receipt className="h-6 w-6 text-brand-500" />
            </div>
            <p className="text-sm font-medium text-gray-600">No expenses yet</p>
            <p className="mt-1 text-xs text-gray-400">Create your first expense to get started!</p>
            <Link href="/dashboard/expenses/new" className="btn-primary mt-4 inline-flex text-sm">
              Add Expense
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {stats?.recentExpenses?.map((expense, i) => (
              <div
                key={expense._id}
                className="flex items-center gap-4 px-6 py-3.5 transition-colors hover:bg-gray-50/50"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                {/* Category color dot */}
                <span
                  className={`inline-flex items-center rounded-lg px-2 py-1 text-[11px] font-semibold ${getCategoryColor(expense.category?.name)}`}
                >
                  {expense.category?.name}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">{expense.title}</p>
                  <p className="text-xs text-gray-400">
                    {expense.department?.name} &middot; {format(new Date(expense.date), "MMM d, yyyy")}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold tabular-nums text-gray-900">
                    {formatCurrency(expense.amount, expense.currency?.code)}
                  </p>
                  {expense.currency && !expense.currency.isBase && expense.amountInBaseCurrency != null && (
                    <p className="text-[11px] tabular-nums text-gray-400">
                      {formatBaseCurrency(expense.amountInBaseCurrency)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
