"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Briefcase,
  Building2,
  CalendarDays,
  HandCoins,
  Info,
  ListPlus,
  MapPin,
  Pencil,
  Plane,
  Plus,
  Receipt,
  StickyNote,
  Trash2,
  TrendingUp,
} from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import { roundMoney } from "@/lib/asset";
import { formatBaseCurrency } from "@/lib/currency";
import { getPaymentBreakdown } from "@/lib/expense";
import { formatTripDates, travelTypeLabel, tripDayCount, withViewerStatus } from "@/lib/trip";
import { useAuth } from "@/contexts/AuthContext";
import { useTitle } from "@/hooks/useTitle";
import { useToast } from "@/components/ui/Toast";
import Modal from "@/components/ui/Modal";
import Skeleton from "@/components/ui/Skeleton";
import Spinner, { InlineLoader } from "@/components/ui/Spinner";
import TripTimeline from "@/components/trips/TripTimeline";
import TripFormModal from "@/components/trips/TripFormModal";
import AddExistingExpensesModal from "@/components/trips/AddExistingExpensesModal";
import { budgetUsage, PersonAvatar, TripStatusPill } from "@/components/trips/TripBadges";
import { TravelTypeIcon, TRAVEL_TYPE_BAR_CLASSES, TRAVEL_TYPE_CHIP_CLASSES } from "@/components/trips/TravelTypeIcon";
import type { ExpenseListItem } from "@/types/expense";
import type { TripDetailResponse, TripDetailSummary, TripListItem } from "@/types/trip";

const UNDO_WINDOW_MS = 5000;

/**
 * The server summary minus expenses still inside their undo window, so the
 * stats move the moment an expense is deleted. A "several people paid"
 * expense can't be split per payer client-side; the refresh after the delete
 * corrects that row.
 */
function withoutExpenses(summary: TripDetailSummary, removed: ExpenseListItem[]): TripDetailSummary {
  if (removed.length === 0) return summary;
  const next: TripDetailSummary = {
    ...summary,
    byType: summary.byType.map((row) => ({ ...row })),
    byPayer: summary.byPayer.map((row) => ({ ...row })),
  };
  for (const expense of removed) {
    const base = expense.amountInBaseCurrency ?? expense.amount ?? 0;
    const { pocketBase: pocket, companyBase: company } = getPaymentBreakdown(expense);
    next.totalAmount = roundMoney(next.totalAmount - base);
    next.pocketAmount = roundMoney(next.pocketAmount - pocket);
    next.companyAmount = roundMoney(next.companyAmount - company);
    next.expenseCount = Math.max(0, next.expenseCount - 1);
    const typeRow = next.byType.find((row) => row.travelType === (expense.travelType ?? null));
    if (typeRow) {
      typeRow.total = roundMoney(typeRow.total - base);
      typeRow.count -= 1;
    }
    if (expense.paymentSource !== "multiple") {
      const payer = next.byPayer.find((row) => row.user._id === expense.createdBy?._id);
      if (payer) {
        payer.totalSpend = roundMoney(payer.totalSpend - base);
        payer.pocketSpend = roundMoney(payer.pocketSpend - pocket);
        payer.companySpend = roundMoney(payer.companySpend - company);
      }
    }
  }
  // Keep the server's order (largest first, untyped last) now the totals moved.
  next.byType = next.byType
    .filter((row) => row.count > 0)
    .sort((a, b) => {
      if (a.travelType === null) return 1;
      if (b.travelType === null) return -1;
      return b.total - a.total;
    });
  next.byPayer = next.byPayer.filter((row) => row.totalSpend > 0.004);
  return next;
}

function BudgetProgress({ spent, budget }: { spent: number; budget: number }) {
  const { percent, over, width, barClass, textClass } = budgetUsage(spent, budget);
  const remaining = roundMoney(budget - spent);
  return (
    <div className="mt-3">
      <div
        className="h-2 overflow-hidden rounded-full bg-white/70 dark:bg-black/30"
        role="progressbar"
        aria-label="Budget used"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(percent, 100)}
      >
        <div className={clsx("h-full rounded-full transition-all", barClass)} style={{ width }} />
      </div>
      <p
        className={clsx(
          "mt-1.5 text-xs",
          textClass,
          over && "font-semibold"
        )}
      >
        <span className="tabular-nums">{percent}%</span> of{" "}
        <span className="tabular-nums">{formatBaseCurrency(budget)}</span>
        {" · "}
        {over ? (
          <>
            <span className="tabular-nums">{formatBaseCurrency(-remaining)}</span> over
          </>
        ) : (
          <>
            <span className="tabular-nums">{formatBaseCurrency(remaining)}</span> left
          </>
        )}
      </p>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon,
  iconClass,
  className,
  children,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
  iconClass: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={clsx("card min-w-0 p-4 sm:p-5", className)}>
      <div className="flex items-start gap-3">
        <div className={clsx("flex-shrink-0 rounded-xl p-2.5", iconClass)}>{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-1 break-words text-lg font-bold tabular-nums text-foreground sm:text-xl">{value}</p>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="animate-fade-in space-y-6" role="status" aria-label="Loading trip">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-[168px] w-full rounded-2xl" />
      <div className="grid gap-4 min-[420px]:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[92px] rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-[240px] rounded-2xl" />
        <Skeleton className="h-[240px] rounded-2xl" />
      </div>
      <Skeleton className="h-[320px] w-full rounded-2xl" />
    </div>
  );
}

interface PendingDelete {
  expense: ExpenseListItem;
  timer: ReturnType<typeof setTimeout>;
}

export default function TripDetailPage() {
  const params = useParams<{ id: string }>();
  const tripId = String(params.id);
  const router = useRouter();
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [data, setData] = useState<TripDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandId, setExpandId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const pendingDeletes = useRef(new Map<string, PendingDelete>());
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  // Only the latest load may apply: an earlier, slower GET mustn't overwrite a newer one.
  const loadSeq = useRef(0);
  useTitle(data?.trip.name || "Trip");

  const syncPending = useCallback(() => setPendingIds([...pendingDeletes.current.keys()]), []);

  const load = useCallback(
    async (quiet: boolean) => {
      const seq = ++loadSeq.current;
      if (quiet) setRefreshing(true);
      try {
        const result: TripDetailResponse = await api.get(`/api/trips/${tripId}`);
        if (seq !== loadSeq.current) return;
        setData({ ...result, trip: withViewerStatus(result.trip) });
      } catch (err) {
        if (seq !== loadSeq.current) return;
        toast(err instanceof Error ? err.message : "Failed to load trip", "error");
        if (!quiet) router.push("/dashboard/trips");
      } finally {
        if (seq === loadSeq.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [tripId, router, toast]
  );

  useEffect(() => {
    setExpandId(new URLSearchParams(window.location.search).get("expand"));
    void load(false);
  }, [load]);

  // Commit deletes still inside their undo window when leaving the page.
  useEffect(() => {
    const pending = pendingDeletes.current;
    return () => {
      const entries = [...pending.values()];
      pending.clear();
      entries.forEach((entry) => {
        clearTimeout(entry.timer);
        void api.delete(`/api/expenses/${entry.expense._id}`).catch(() => undefined);
      });
    };
  }, []);

  const pendingSet = useMemo(() => new Set(pendingIds), [pendingIds]);
  const expenses = useMemo(
    () => (data ? data.expenses.filter((e) => !pendingSet.has(e._id)) : []),
    [data, pendingSet]
  );
  const summary = useMemo(
    () => (data ? withoutExpenses(data.summary, data.expenses.filter((e) => pendingSet.has(e._id))) : null),
    [data, pendingSet]
  );

  const handleDelete = useCallback(
    (expense: ExpenseListItem) => {
      if ((expense.linkedAssetCount || 0) > 0) {
        toast("Linked asset purchases cannot be deleted from Expenses", "error");
        return;
      }
      if (pendingDeletes.current.has(expense._id)) return;

      const timer = setTimeout(async () => {
        if (!pendingDeletes.current.has(expense._id)) return;
        try {
          await api.delete(`/api/expenses/${expense._id}`);
          // Drop it from the loaded data before un-hiding, then refresh the totals.
          setData((prev) =>
            prev
              ? {
                  ...prev,
                  expenses: prev.expenses.filter((e) => e._id !== expense._id),
                  summary: withoutExpenses(prev.summary, prev.expenses.filter((e) => e._id === expense._id)),
                }
              : prev
          );
          pendingDeletes.current.delete(expense._id);
          syncPending();
          void load(true);
        } catch {
          pendingDeletes.current.delete(expense._id);
          syncPending();
          toast("Failed to delete expense", "error");
        }
      }, UNDO_WINDOW_MS);

      pendingDeletes.current.set(expense._id, { expense, timer });
      syncPending();

      toast(`Deleted "${expense.title}"`, "info", {
        durationMs: UNDO_WINDOW_MS,
        action: {
          label: "Undo",
          onClick: () => {
            const pending = pendingDeletes.current.get(expense._id);
            if (!pending) return;
            clearTimeout(pending.timer);
            pendingDeletes.current.delete(expense._id);
            syncPending();
          },
        },
      });
    },
    [load, syncPending, toast]
  );

  const handleRemoveFromTrip = useCallback(
    async (expense: ExpenseListItem) => {
      try {
        await api.patch(`/api/trips/${tripId}/expenses`, { remove: [expense._id] });
        toast(`Removed "${expense.title}" from this trip`, "success", {
          durationMs: UNDO_WINDOW_MS,
          action: {
            label: "Undo",
            onClick: () => {
              // PUT rather than PATCH add: leaving the trip cleared the travel type.
              api
                .put(`/api/expenses/${expense._id}`, { trip: tripId, travelType: expense.travelType ?? null })
                .then(() => load(true))
                .catch((err) => toast(err instanceof Error ? err.message : "Failed to restore expense", "error"));
            },
          },
        });
        await load(true);
      } catch (err) {
        toast(err instanceof Error ? err.message : "Failed to remove expense from trip", "error");
      }
    },
    [tripId, load, toast]
  );

  const handleTripSaved = (trip: TripListItem) => {
    setEditOpen(false);
    setData((prev) => (prev ? { ...prev, trip: withViewerStatus(trip) } : prev));
    toast("Trip updated");
    void load(true);
  };

  const handleAdded = (count: number) => {
    setAddOpen(false);
    toast(`Added ${count} expense${count !== 1 ? "s" : ""} to this trip`);
    void load(true);
  };

  const handleDeleteTrip = async () => {
    setDeleting(true);
    try {
      await api.delete(`/api/trips/${tripId}`);
      toast("Trip deleted. Its expenses are still in Expenses.");
      setDeleteOpen(false);
      router.push("/dashboard/trips");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to delete trip", "error");
      setDeleting(false);
    }
  };

  if (loading || !data || !summary) return <DetailSkeleton />;

  const { trip } = data;
  const days = tripDayCount(trip);
  const newExpenseHref = `/dashboard/expenses/new?trip=${trip._id}`;
  const perDay = days > 0 ? summary.totalAmount / days : 0;
  const byType = summary.byType;
  const typeTotal = byType.reduce((sum, row) => sum + Math.max(row.total, 0), 0);

  return (
    <div className="animate-fade-in space-y-6">
      <Link
        href="/dashboard/trips"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Trips
      </Link>

      {/* Hero */}
      <section className="card relative overflow-hidden border-sky-100 bg-gradient-to-br from-sky-50/80 via-surface to-surface p-4 dark:border-sky-500/20 dark:from-sky-500/10 sm:p-6">
        <Plane
          className="pointer-events-none absolute -right-6 -top-6 h-36 w-36 -rotate-12 text-sky-500/[0.07] dark:text-sky-300/[0.06]"
          aria-hidden="true"
        />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="break-words text-2xl font-bold text-foreground">{trip.name}</h1>
              <TripStatusPill status={trip.status} size="md" />
            </div>
            <div className="flex flex-col gap-1.5 text-sm text-muted sm:flex-row sm:flex-wrap sm:gap-x-5">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4 text-sky-500" aria-hidden="true" />
                {formatTripDates(trip)} · {days} day{days !== 1 ? "s" : ""}
              </span>
              {trip.destinations.length > 0 && (
                <span className="inline-flex items-start gap-1.5">
                  <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-400" aria-hidden="true" />
                  {trip.destinations.join(" → ")}
                </span>
              )}
              {trip.purpose && (
                <span className="inline-flex items-start gap-1.5">
                  <Briefcase className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" aria-hidden="true" />
                  {trip.purpose}
                </span>
              )}
              {trip.department && (
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="h-4 w-4 text-indigo-400" aria-hidden="true" />
                  {trip.department.name}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex -space-x-2">
                {trip.travelers.slice(0, 6).map((person) => (
                  <PersonAvatar key={person._id} person={person} />
                ))}
              </div>
              <p className="text-sm text-muted">
                {trip.travelers.map((p) => p.name).join(", ")}
              </p>
            </div>
            {trip.notes && (
              <p className="flex items-start gap-1.5 whitespace-pre-line text-sm text-muted-foreground">
                <StickyNote className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                {trip.notes}
              </p>
            )}
          </div>

          <div className="grid flex-shrink-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Link href={newExpenseHref} className="btn-primary px-3 sm:px-5">
              <Plus className="h-4 w-4" /> Add expense
            </Link>
            <button type="button" onClick={() => setAddOpen(true)} className="btn-secondary px-3 sm:px-5">
              <ListPlus className="h-4 w-4" /> Add existing
            </button>
            {trip.canManage && (
              <>
                <button type="button" onClick={() => setEditOpen(true)} className="btn-secondary px-3 sm:px-3.5" aria-label="Edit trip">
                  <Pencil className="h-4 w-4" />
                  <span className="sm:hidden lg:inline">Edit</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteOpen(true)}
                  className="btn-ghost px-3 text-red-600 sm:px-3.5 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-500/10"
                  aria-label="Delete trip"
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="sm:hidden lg:inline">Delete</span>
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      {!isAdmin && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
          Showing your expenses on this trip
        </p>
      )}

      {/* Stats */}
      <div className="grid gap-4 min-[420px]:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={isAdmin ? "Total spend" : "Your spend"}
          value={formatBaseCurrency(summary.totalAmount)}
          hint={summary.expenseCount > 0 ? `≈ ${formatBaseCurrency(perDay)} per day` : undefined}
          icon={<TrendingUp className="h-5 w-5" />}
          iconClass="bg-gradient-to-br from-emerald-500 to-teal-500 text-white"
          className="border-emerald-100 bg-gradient-to-r from-emerald-50 to-teal-50 dark:border-emerald-500/30 dark:from-emerald-500/10 dark:to-teal-500/10"
        >
          {/* A user's totals cover only their own expenses, so they can't be read against the trip budget. */}
          {isAdmin && trip.budget != null && <BudgetProgress spent={summary.totalAmount} budget={trip.budget} />}
        </StatCard>
        <StatCard
          label="Paid from pocket"
          value={formatBaseCurrency(summary.pocketAmount)}
          hint="Owed to travelers"
          icon={<HandCoins className="h-5 w-5" />}
          iconClass="bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300"
        />
        <StatCard
          label="Paid by company"
          value={formatBaseCurrency(summary.companyAmount)}
          hint="Company cards & accounts"
          icon={<Building2 className="h-5 w-5" />}
          iconClass="bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300"
        />
        <StatCard
          label="Expenses"
          value={String(summary.expenseCount)}
          hint={refreshing ? "Updating..." : `Across ${days} day${days !== 1 ? "s" : ""}`}
          icon={<Receipt className="h-5 w-5" />}
          iconClass="bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300"
        />
      </div>

      {summary.expenseCount > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Spend by type */}
          <section className="card p-5" aria-labelledby="spend-by-type">
            <h2 id="spend-by-type" className="text-base font-bold text-foreground">
              Spend by type
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {isAdmin ? "Where the trip money went." : "Where your money on this trip went."}
            </p>
            {typeTotal > 0 && (
              <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-subtle" aria-hidden="true">
                {byType.map((row) => (
                  <div
                    key={row.travelType ?? "none"}
                    className={TRAVEL_TYPE_BAR_CLASSES[row.travelType ?? "none"]}
                    style={{ width: `${(Math.max(row.total, 0) / typeTotal) * 100}%` }}
                  />
                ))}
              </div>
            )}
            <ul className="mt-4 space-y-3">
              {byType.map((row) => {
                const key = row.travelType ?? "none";
                const percent = typeTotal > 0 ? Math.round((Math.max(row.total, 0) / typeTotal) * 100) : 0;
                return (
                  <li key={key} data-testid="type-row">
                    <div className="flex items-center gap-3">
                      <span className={clsx("flex-shrink-0 rounded-lg p-1.5", TRAVEL_TYPE_CHIP_CLASSES[key])}>
                        <TravelTypeIcon type={row.travelType} className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="truncate text-sm font-medium text-foreground">
                            {travelTypeLabel(row.travelType)}
                            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                              {row.count} item{row.count !== 1 ? "s" : ""}
                            </span>
                          </p>
                          <p className="flex-shrink-0 text-sm font-semibold tabular-nums text-foreground">
                            {formatBaseCurrency(row.total)}
                            <span className="ml-1.5 inline-block w-9 text-right text-xs font-normal text-muted-foreground">
                              {percent}%
                            </span>
                          </p>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-subtle">
                          <div
                            className={clsx("h-full rounded-full", TRAVEL_TYPE_BAR_CLASSES[key])}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Who paid */}
          <section className="card p-5" aria-labelledby="who-paid">
            <h2 id="who-paid" className="text-base font-bold text-foreground">
              Who paid
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Out-of-pocket spend is what the company owes each person.
            </p>
            {summary.byPayer.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">No payments recorded yet.</p>
            ) : (
              <ul className="mt-4 divide-y divide-line">
                {summary.byPayer.map((row) => (
                  <li key={row.user._id} data-testid="payer-row" className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <PersonAvatar person={row.user} className="h-9 w-9 text-xs" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{row.user.name}</p>
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {formatBaseCurrency(row.totalSpend)} total
                      </p>
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {formatBaseCurrency(row.companySpend)} company
                      </p>
                    </div>
                    {row.pocketSpend > 0 ? (
                      <div className="flex-shrink-0 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-right dark:border-amber-500/30 dark:bg-amber-500/10">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                          Owed
                        </p>
                        <p className="text-sm font-bold tabular-nums text-amber-900 dark:text-amber-100">
                          {formatBaseCurrency(row.pocketSpend)}
                        </p>
                      </div>
                    ) : (
                      <span className="flex-shrink-0 rounded-full bg-subtle px-2.5 py-1 text-xs text-muted-foreground">
                        Nothing owed
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {/* Timeline */}
      <section aria-labelledby="trip-timeline" className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 id="trip-timeline" className="text-lg font-bold text-foreground">
            Timeline
          </h2>
          {expenses.length > 0 && (
            <span className="rounded-full bg-subtle px-2 py-0.5 text-xs font-semibold text-muted">
              {expenses.length}
            </span>
          )}
          {refreshing && <InlineLoader label="Refreshing..." className="ml-1" />}
        </div>
        {expenses.length === 0 ? (
          <div className="card flex flex-col items-center px-6 py-12 text-center">
            <div className="mb-4 rounded-full bg-sky-50 p-4 text-sky-500 dark:bg-sky-500/10 dark:text-sky-300">
              <Plane className="h-7 w-7" />
            </div>
            <h3 className="text-lg font-medium text-foreground">No expenses on this trip yet</h3>
            <p className="mb-6 mt-1 max-w-sm text-sm text-muted-foreground">
              Log tickets, hotels and meals as they happen, or pull in expenses you&apos;ve already recorded.
            </p>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Link href={newExpenseHref} className="btn-primary">
                <Plus className="h-4 w-4" /> Add expense
              </Link>
              <button type="button" onClick={() => setAddOpen(true)} className="btn-secondary">
                <ListPlus className="h-4 w-4" /> Add existing
              </button>
            </div>
          </div>
        ) : (
          <TripTimeline
            trip={trip}
            expenses={expenses}
            onDelete={handleDelete}
            onRemoveFromTrip={handleRemoveFromTrip}
            initialExpandedId={expandId}
            returnTo={`/dashboard/trips/${trip._id}`}
          />
        )}
      </section>

      <TripFormModal isOpen={editOpen} onClose={() => setEditOpen(false)} trip={trip} onSaved={handleTripSaved} />
      <AddExistingExpensesModal
        tripId={trip._id}
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        onAdded={handleAdded}
      />
      <Modal isOpen={deleteOpen} onClose={() => !deleting && setDeleteOpen(false)} title="Delete trip">
        <div className="space-y-3 text-sm text-muted">
          <p>
            Delete <span className="font-semibold text-foreground">{trip.name}</span>?
          </p>
          <p className="rounded-xl border border-line bg-subtle/50 px-3 py-2.5">
            Expenses are kept. They&apos;re just unlinked from this trip and stay in Expenses with their
            receipts and amounts. Their travel type tags are cleared.
          </p>
        </div>
        <div className="-mx-6 mt-5 flex flex-col-reverse gap-2 border-t border-line px-6 pt-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => setDeleteOpen(false)} className="btn-secondary" disabled={deleting}>
            Cancel
          </button>
          <button type="button" onClick={handleDeleteTrip} className="btn-danger" disabled={deleting}>
            {deleting ? (
              <>
                <Spinner size="sm" /> Deleting...
              </>
            ) : (
              "Delete trip"
            )}
          </button>
        </div>
      </Modal>
    </div>
  );
}
