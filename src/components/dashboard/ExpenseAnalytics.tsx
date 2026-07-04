"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import Skeleton from "@/components/ui/Skeleton";
import { MonthlyTrendCard } from "@/components/dashboard/charts/MonthlyTrendCard";
import { TopCategoriesCard } from "@/components/dashboard/charts/TopCategoriesCard";
import { DepartmentSpendCard } from "@/components/dashboard/charts/DepartmentSpendCard";
import { PaymentSourceCard } from "@/components/dashboard/charts/PaymentSourceCard";

interface ChartData {
  monthlyTrend: Array<{ month: string; key: string; total: number; count: number }>;
  topCategories: Array<{ _id?: string | null; name: string; total: number; count: number }>;
  paymentSources: Array<{ name: string; total: number; count: number }>;
  departmentSpend: Array<{ _id?: string | null; name: string; total: number; count: number }>;
}

interface ExpenseAnalyticsProps {
  filterQuery: string;
  refreshKey?: number;
}

const EMPTY_CHARTS: ChartData = {
  monthlyTrend: [],
  topCategories: [],
  paymentSources: [],
  departmentSpend: [],
};

export function ExpenseAnalytics({ filterQuery, refreshKey = 0 }: ExpenseAnalyticsProps) {
  const [charts, setCharts] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let active = true;
    // Keep previous data on screen; only show the skeleton on the very first
    // load, and a subtle inline indicator on subsequent refetches.
    setRefreshing(true);

    async function load() {
      try {
        const data = await api.get(`/api/dashboard/charts?${filterQuery}`);
        if (!active) return;
        setCharts(data);
      } catch {
        // Keep the last good data on failure.
      } finally {
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [filterQuery, refreshKey]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-foreground">Analytics</h2>
          <p className="text-xs text-muted-foreground">Reflects the filters above.</p>
        </div>
        {refreshing && charts && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Updating…
          </span>
        )}
      </div>

      {loading && !charts ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[300px] w-full rounded-2xl" />
          ))}
        </div>
      ) : (
        // After the first load resolves, always render the cards. If that first
        // fetch failed, fall back to empty data so each card shows its own
        // empty state rather than a blank rail.
        <div className="space-y-4">
          <MonthlyTrendCard data={(charts ?? EMPTY_CHARTS).monthlyTrend} dense />
          <TopCategoriesCard data={(charts ?? EMPTY_CHARTS).topCategories} dense />
          <DepartmentSpendCard data={(charts ?? EMPTY_CHARTS).departmentSpend} dense />
          <PaymentSourceCard data={(charts ?? EMPTY_CHARTS).paymentSources} dense />
        </div>
      )}
    </div>
  );
}
