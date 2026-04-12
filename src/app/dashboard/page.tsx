"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTitle } from "@/hooks/useTitle";
import { api } from "@/lib/api";
import { PageLoader } from "@/components/ui/Spinner";
import { Receipt, Building2, Tag, TrendingUp, ArrowUpRight } from "lucide-react";
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
      color: "bg-blue-50 text-blue-600",
      href: "/dashboard/expenses",
    },
    {
      label: "Total Amount",
      value: formatBaseCurrency(stats?.totalAmount || 0),
      icon: TrendingUp,
      color: "bg-emerald-50 text-emerald-600",
      href: "/dashboard/expenses",
    },
    {
      label: "Departments",
      value: stats?.departmentCount || 0,
      icon: Building2,
      color: "bg-purple-50 text-purple-600",
      href: "/dashboard/departments",
    },
    {
      label: "Categories",
      value: stats?.categoryCount || 0,
      icon: Tag,
      color: "bg-amber-50 text-amber-600",
      href: "/dashboard/categories",
    },
  ];

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {user?.name?.split(" ")[0]}
        </h1>
        <p className="text-sm text-gray-500">Here&apos;s an overview of your expenses.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="card group flex items-center gap-4 p-5 transition-shadow hover:shadow-md"
          >
            <div className={`rounded-xl p-3 ${card.color}`}>
              <card.icon className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-500">{card.label}</p>
              <p className="text-xl font-bold text-gray-900">{card.value}</p>
            </div>
            <ArrowUpRight className="h-4 w-4 text-gray-300 transition-colors group-hover:text-gray-500" />
          </Link>
        ))}
      </div>

      <div className="card">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="font-semibold text-gray-900">Recent Expenses</h2>
          <Link href="/dashboard/expenses" className="text-sm font-medium text-brand-600 hover:text-brand-700">
            View all
          </Link>
        </div>

        {stats?.recentExpenses?.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-gray-500">No expenses yet. Create your first expense!</p>
            <Link href="/dashboard/expenses/new" className="btn-primary mt-4 inline-flex">
              Add Expense
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {stats?.recentExpenses?.map((expense) => (
              <div
                key={expense._id}
                className="flex items-center justify-between px-6 py-3.5 transition-colors hover:bg-gray-50"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">{expense.title}</p>
                  <p className="text-xs text-gray-500">
                    {expense.category?.name} &middot; {expense.department?.name} &middot;{" "}
                    {format(new Date(expense.date), "MMM d, yyyy")}
                  </p>
                </div>
                <p className="ml-4 text-sm font-semibold tabular-nums text-gray-900">
                  {formatCurrency(expense.amount, expense.currency?.code)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
