"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Building2, CalendarDays, ReceiptText, Tag, Users, Wallet } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTitle } from "@/hooks/useTitle";
import { api } from "@/lib/api";
import { formatBaseCurrency } from "@/lib/currency";
import { monthFromKey, monthProgress } from "@/lib/month";
import PageHeader from "@/components/ui/PageHeader";
import StatBand, { Stat } from "@/components/ui/StatBand";
import Panel, { PanelGrid } from "@/components/ui/Panel";
import SplitBar from "@/components/ui/SplitBar";
import Avatar from "@/components/ui/Avatar";
import CategoryGlyph from "@/components/ui/CategoryGlyph";
import EmptyState from "@/components/ui/EmptyState";
import { DashboardSkeleton } from "@/components/ui/Skeleton";
import { linkClass } from "@/components/ui/styles";
import MonthlySpendPanel from "@/components/dashboard/overview/MonthlySpendPanel";
import RankedList, { type RankedItem } from "@/components/dashboard/overview/RankedList";
import LatestEntries from "@/components/dashboard/overview/LatestEntries";
import { percentOf, plural } from "@/components/dashboard/overview/format";
import type { OverviewCharts, OverviewStats, PersonSpend } from "@/components/dashboard/overview/types";

/** Below this the top-six remainder is rounding noise, not "other" spend. */
const MIN_REMAINDER = 0.005;
/** People listed under "Pocket spend by person". */
const TOP_PAYERS = 5;

/** `items` plus one muted row for whatever of `whole` they leave out. */
function withRemainder(items: RankedItem[], whole: number, label: string, leading?: RankedItem["leading"]): RankedItem[] {
  const rest = whole - items.reduce((sum, item) => sum + item.total, 0);
  if (!items.length || rest <= MIN_REMAINDER) return items;
  return [...items, { key: "other", label, total: rest, leading, tone: "muted" }];
}

export default function DashboardPage() {
  const { isAdmin } = useAuth();
  useTitle("Overview");
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [charts, setCharts] = useState<OverviewCharts | null>(null);
  // Admins: everyone's all-time spend (Spend by user's numbers), for "Who paid".
  const [people, setPeople] = useState<PersonSpend[]>([]);
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

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    api
      .get("/api/users")
      .then((data: { users?: PersonSpend[] }) => {
        if (active) setPeople(data.users ?? []);
      })
      .catch(() => {
        // Best-effort: the panel still shows the company/pocket split.
      });
    return () => {
      active = false;
    };
  }, [isAdmin]);

  if (loading) return <DashboardSkeleton />;

  const total = stats?.totalAmount ?? 0;
  const count = stats?.totalExpenses ?? 0;
  const departmentCount = stats?.departmentCount ?? 0;
  const categoryCount = stats?.categoryCount ?? 0;

  const monthly = charts?.monthlyTrend ?? [];
  const thisMonth = monthly[monthly.length - 1];
  // Label and day count both from the server's (UTC) month bucket.
  const progress = thisMonth ? monthProgress(thisMonth.key) : null;

  const pocket = stats?.pocketAmount ?? 0;
  const company = stats?.companyAmount ?? 0;

  // The charts return the top six of each; the rest is one row, so shares add up to 100%.
  const categoryItems = withRemainder(
    (charts?.topCategories ?? []).map((c) => ({
      key: c._id ?? c.name,
      label: c.name,
      total: c.total,
      href: c._id ? `/dashboard/expenses?category=${c._id}` : "/dashboard/expenses",
      leading: <CategoryGlyph name={c.name} />,
    })),
    total,
    "Other categories",
    <CategoryGlyph tone="neutral" />
  );

  const departmentItems = withRemainder(
    (charts?.departmentSpend ?? []).map((d, i) => ({
      key: d._id ?? d.name,
      label: d.name,
      total: d.total,
      href: d._id ? `/dashboard/expenses?department=${d._id}` : undefined,
      tone: i === 0 ? ("ramp" as const) : ("accent" as const),
    })),
    total,
    "Other departments"
  );

  // Who is owed the most: pocket spend credited to each person, as Spend by user counts it.
  const payerItems = withRemainder(
    people
      .filter((p) => p.pocketSpend > MIN_REMAINDER)
      .sort((a, b) => b.pocketSpend - a.pocketSpend)
      .slice(0, TOP_PAYERS)
      .map((p) => ({
        key: p._id,
        label: p.name || p.email,
        total: p.pocketSpend,
        href: `/dashboard/expenses?paidBy=${p._id}`,
        leading: <Avatar name={p.name || p.email} photoURL={p.photoURL} size={28} tone="amber" />,
        tone: "pocket" as const,
      })),
    pocket,
    "Other people",
    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sunk text-ink-3">
      <Users aria-hidden="true" size={14} strokeWidth={1.75} />
    </span>
  );

  return (
    <div className="animate-fade-in flex flex-col gap-6">
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
        {thisMonth && progress && (
          <Stat
            label={`${format(monthFromKey(thisMonth.key), "MMMM")} to date`}
            icon={CalendarDays}
            value={formatBaseCurrency(thisMonth.total)}
            sub={`${plural(thisMonth.count, "expense")} · ${progress.day} of ${progress.days} days`}
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

        {/* Admins only: a user's own split is already in the band ("Paid from pocket"),
            and the per-person list needs everyone's spend. */}
        {isAdmin && (
          <Panel title="Who paid" meta="Company vs pocket" bodyClassName="gap-5">
            {pocket + company > 0 ? (
              <>
                <SplitBar company={company} pocket={pocket} />
                {payerItems.length > 0 && (
                  <section aria-labelledby="pocket-by-person" className="flex flex-col gap-2">
                    <h3 id="pocket-by-person" className="cap text-ink-3">
                      Pocket spend by person
                    </h3>
                    <RankedList items={payerItems} whole={pocket} />
                  </section>
                )}
              </>
            ) : (
              <EmptyState
                icon={<Wallet />}
                title="No payment data"
                description="Company and pocket spend will appear here."
              />
            )}
          </Panel>
        )}

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
