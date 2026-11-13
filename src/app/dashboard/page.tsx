"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format, getDaysInMonth } from "date-fns";
import { Building2, CalendarDays, ReceiptText, Tag, Wallet } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTitle } from "@/hooks/useTitle";
import { api } from "@/lib/api";
import { formatBaseCurrency } from "@/lib/currency";
import PageHeader from "@/components/ui/PageHeader";
import StatBand, { Stat } from "@/components/ui/StatBand";
import Panel, { PanelGrid } from "@/components/ui/Panel";
import SplitBar from "@/components/ui/SplitBar";
import CategoryGlyph from "@/components/ui/CategoryGlyph";
import EmptyState from "@/components/ui/EmptyState";
import { DashboardSkeleton } from "@/components/ui/Skeleton";
import { linkClass } from "@/components/ui/styles";
import MonthlySpendPanel from "@/components/dashboard/overview/MonthlySpendPanel";
import RankedList, { type RankedItem } from "@/components/dashboard/overview/RankedList";
import LatestEntries from "@/components/dashboard/overview/LatestEntries";
import { monthFromKey, percentOf, plural } from "@/components/dashboard/overview/format";
import type { OverviewCharts, OverviewStats } from "@/components/dashboard/overview/types";

/** Below this the top-six remainder is rounding noise, not "other" spend. */
const MIN_REMAINDER = 0.005;

export default function DashboardPage() {
  const { isAdmin } = useAuth();
  useTitle("Overview");
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [charts, setCharts] = useState<OverviewCharts | null>(null);
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

  const total = stats?.totalAmount ?? 0;
  const count = stats?.totalExpenses ?? 0;
  const departmentCount = stats?.departmentCount ?? 0;
  const categoryCount = stats?.categoryCount ?? 0;

  const monthly = charts?.monthlyTrend ?? [];
  const thisMonth = monthly[monthly.length - 1];
  const today = new Date();

  const sourceTotal = (name: string) => charts?.paymentSources.find((s) => s.name === name)?.total ?? 0;
  const pocket = sourceTotal("pocket");
  const company = sourceTotal("company");

  const topCategories = charts?.topCategories ?? [];
  const otherCategories = total - topCategories.reduce((sum, c) => sum + c.total, 0);
  const categoryItems: RankedItem[] = topCategories.map((c) => ({
    key: c._id ?? c.name,
    label: c.name,
    total: c.total,
    href: c._id ? `/dashboard/expenses?category=${c._id}` : "/dashboard/expenses",
    leading: <CategoryGlyph name={c.name} />,
  }));
  if (categoryItems.length && otherCategories > MIN_REMAINDER) {
    categoryItems.push({
      key: "other",
      label: "Other categories",
      total: otherCategories,
      leading: <CategoryGlyph tone="neutral" />,
      tone: "muted",
    });
  }

  const departmentItems: RankedItem[] = (charts?.departmentSpend ?? []).map((d, i) => ({
    key: d._id ?? d.name,
    label: d.name,
    total: d.total,
    href: d._id ? `/dashboard/expenses?department=${d._id}` : undefined,
    tone: i === 0 ? "ramp" : "accent",
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Overview"
        meta={
          isAdmin
            ? "Company spend across every department, all time, in INR."
            : "Your spend across all time, in INR."
        }
      />

      <StatBand>
        <Stat
          headline
          label="Total spend"
          value={formatBaseCurrency(total)}
          sub={`${plural(count, "expense")} · ${plural(departmentCount, "department")} · ${plural(categoryCount, "category", "categories")}`}
        />
        {thisMonth && (
          <Stat
            label={`${format(monthFromKey(thisMonth.key), "MMMM")} to date`}
            icon={CalendarDays}
            value={formatBaseCurrency(thisMonth.total)}
            sub={`${plural(thisMonth.count, "expense")} · ${today.getDate()} of ${getDaysInMonth(today)} days`}
          />
        )}
        <Stat
          label="Paid from pocket"
          icon={Wallet}
          tone="amber"
          value={formatBaseCurrency(pocket)}
          sub={`${percentOf(pocket, pocket + company).toFixed(1)}% of spend`}
        />
        <Stat
          label="Average expense"
          icon={ReceiptText}
          value={formatBaseCurrency(count > 0 ? total / count : 0)}
          sub={count > 0 ? `Total ÷ ${count.toLocaleString("en-IN")}` : "Nothing recorded yet"}
        />
      </StatBand>

      <PanelGrid min={440}>
        <MonthlySpendPanel data={monthly} />

        <Panel
          title="Categories"
          actions={
            <Link className={linkClass} href="/dashboard/categories">
              All {categoryCount}
            </Link>
          }
        >
          {categoryItems.length ? (
            <RankedList items={categoryItems} whole={total} />
          ) : (
            <EmptyState
              icon={<Tag />}
              title="No category data"
              description="Your top categories will appear here."
            />
          )}
        </Panel>

        <Panel
          title="Departments"
          actions={
            <Link className={linkClass} href="/dashboard/departments">
              All {departmentCount}
            </Link>
          }
        >
          {departmentItems.length ? (
            <RankedList items={departmentItems} whole={total} />
          ) : (
            <EmptyState
              icon={<Building2 />}
              title="No department data"
              description="Spend by department will appear here."
            />
          )}
        </Panel>

        <Panel title="Who paid" meta="Company vs pocket">
          {pocket + company > 0 ? (
            <SplitBar company={company} pocket={pocket} />
          ) : (
            <EmptyState
              icon={<Wallet />}
              title="No payment data"
              description="Company and pocket spend will appear here."
            />
          )}
        </Panel>

        <Panel
          title="Your latest entries"
          flush
          actions={
            <Link className={linkClass} href="/dashboard/expenses">
              All {plural(count, "expense")}
            </Link>
          }
        >
          <LatestEntries expenses={stats?.recentExpenses ?? []} />
        </Panel>
      </PanelGrid>
    </div>
  );
}
