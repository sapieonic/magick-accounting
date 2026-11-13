"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Briefcase,
  Building2,
  CalendarDays,
  Info,
  ListPlus,
  Luggage,
  MapPin,
  Pencil,
  Plus,
  Sparkles,
  StickyNote,
  Trash2,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { roundMoney } from "@/lib/asset";
import { formatBaseCurrency } from "@/lib/currency";
import { getPaymentBreakdown } from "@/lib/expense";
import { dayKey, formatTripDates, isWithinTrip, travelTypeLabel, tripDayCount, withViewerStatus } from "@/lib/trip";
import { useAuth } from "@/contexts/AuthContext";
import { useTitle } from "@/hooks/useTitle";
import { useToast } from "@/components/ui/Toast";
import Modal from "@/components/ui/Modal";
import Skeleton from "@/components/ui/Skeleton";
import { InlineLoader } from "@/components/ui/Spinner";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import StatBand, { Stat } from "@/components/ui/StatBand";
import Panel, { PanelGrid } from "@/components/ui/Panel";
import RankedBar from "@/components/ui/RankedBar";
import EmptyState from "@/components/ui/EmptyState";
import CategoryGlyph from "@/components/ui/CategoryGlyph";
import TripTimeline from "@/components/trips/TripTimeline";
import TripFormModal from "@/components/trips/TripFormModal";
import AddExistingExpensesModal from "@/components/trips/AddExistingExpensesModal";
import { BudgetMeter, PersonAvatar, TripStatusBadge } from "@/components/trips/TripMeta";
import { TravelGlyph } from "@/components/trips/TravelTypeIcon";
import BandCell from "@/components/expenses/ledger/BandCell";
import { baseAmount, expenseDate } from "@/components/expenses/ledger/format";
import type { ExpenseListItem } from "@/types/expense";
import type { TripDetailResponse, TripDetailSummary, TripListItem } from "@/types/trip";

const UNDO_WINDOW_MS = 5000;
/** Suggestions shown in the "Might belong here" panel. */
const SUGGESTIONS = 3;

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
    const base = baseAmount(expense);
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

function DetailSkeleton() {
  return (
    <div className="animate-fade-in flex flex-col gap-6" role="status" aria-label="Loading trip">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-7 w-72 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="h-[118px] w-full rounded-panel" />
      <div className="flex flex-wrap gap-5">
        <Skeleton className="h-[360px] min-w-0 grow-[999] basis-[500px] rounded-panel" />
        <Skeleton className="h-[360px] min-w-0 grow basis-[320px] rounded-panel" />
      </div>
    </div>
  );
}

/** One fact in the trip's meta line. */
function MetaItem({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="inline-flex min-w-0 items-start gap-1.5">
      <Icon aria-hidden="true" size={15} strokeWidth={1.5} className="mt-0.5 shrink-0 text-ink-3" />
      {children}
    </span>
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
  const [candidates, setCandidates] = useState<ExpenseListItem[] | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
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

  // Unlinked expenses that might belong here, refreshed whenever the trip reloads.
  useEffect(() => {
    if (!data) return;
    let active = true;
    api
      .get(`/api/trips/${tripId}/candidates`)
      .then((result: { expenses?: ExpenseListItem[] }) => {
        if (active) setCandidates(result.expenses || []);
      })
      .catch(() => {
        // Suggestions are optional; "Add existing" still lists them.
      });
    return () => {
      active = false;
    };
  }, [data, tripId]);

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

  // One suggestion straight into the trip, through the same endpoint as "Add existing".
  const handleAddSuggestion = async (expense: ExpenseListItem) => {
    setAdding(expense._id);
    try {
      await api.patch(`/api/trips/${tripId}/expenses`, { add: [expense._id] });
      setCandidates((prev) => prev && prev.filter((e) => e._id !== expense._id));
      toast(`Added "${expense.title}" to this trip`);
      void load(true);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to add expense", "error");
    } finally {
      setAdding(null);
    }
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
  const typeMax = Math.max(0, ...byType.map((row) => row.total));
  const travellerIds = new Set(trip.travelers.map((t) => t._id));
  // Dated inside the trip and by a traveller: the likeliest strays.
  const suggestions = (candidates ?? [])
    .filter((e) => isWithinTrip(dayKey(e.date), trip) && travellerIds.has(e.createdBy?._id))
    .slice(0, SUGGESTIONS);
  // Only an admin's totals cover the whole trip, so only they split it per traveller.
  const perTraveller = isAdmin && trip.travelers.length > 1 ? summary.totalAmount / trip.travelers.length : null;
  const countLabel = `${summary.expenseCount} expense${summary.expenseCount !== 1 ? "s" : ""}`;

  const addButtons = (
    <>
      <Button icon={Plus} href={newExpenseHref}>
        Add expense
      </Button>
      <Button variant="secondary" icon={ListPlus} onClick={() => setAddOpen(true)}>
        Add existing
      </Button>
    </>
  );

  return (
    <div className="animate-fade-in flex flex-col gap-6">
      <PageHeader
        title={trip.name}
        breadcrumb={[{ label: "Trips", href: "/dashboard/trips" }, { label: trip.name }]}
        meta={
          <span className="flex flex-wrap items-center gap-x-[18px] gap-y-2 text-ink-2">
            <TripStatusBadge status={trip.status} />
            <MetaItem icon={CalendarDays}>
              {formatTripDates(trip)} · {days} day{days !== 1 ? "s" : ""}
            </MetaItem>
            {trip.travelers.length > 0 && (
              <MetaItem icon={Users}>{trip.travelers.map((p) => p.name).join(", ")}</MetaItem>
            )}
            {trip.destinations.length > 0 && (
              <MetaItem icon={MapPin}>
                <span>{trip.destinations.join(" → ")}</span>
              </MetaItem>
            )}
            {trip.purpose && (
              <MetaItem icon={Briefcase}>
                <span>{trip.purpose}</span>
              </MetaItem>
            )}
            {trip.department && <MetaItem icon={Building2}>{trip.department.name}</MetaItem>}
          </span>
        }
        actions={
          <>
            {trip.canManage && (
              <>
                <Button variant="secondary" icon={Pencil} onClick={() => setEditOpen(true)}>
                  Edit trip
                </Button>
                <Button variant="danger" icon={Trash2} onClick={() => setDeleteOpen(true)} aria-label="Delete trip">
                  Delete
                </Button>
              </>
            )}
            {addButtons}
          </>
        }
      />

      {(trip.notes || !isAdmin) && (
        <div className="flex flex-col gap-1.5 text-[13px] text-ink-3">
          {trip.notes && (
            <p className="flex items-start gap-1.5 whitespace-pre-line text-ink-2">
              <StickyNote aria-hidden="true" size={15} strokeWidth={1.5} className="mt-0.5 shrink-0 text-ink-3" />
              {trip.notes}
            </p>
          )}
          {!isAdmin && (
            <p className="flex items-center gap-1.5">
              <Info aria-hidden="true" size={14} strokeWidth={1.5} className="shrink-0" />
              Showing your expenses on this trip
            </p>
          )}
        </div>
      )}

      <StatBand aria-label="Trip totals">
        <Stat
          headline
          label={isAdmin ? "Trip total" : "Your spend"}
          value={formatBaseCurrency(summary.totalAmount)}
          sub={
            summary.expenseCount > 0
              ? `${countLabel} · ≈ ${formatBaseCurrency(perDay)} per day`
              : `No expenses yet · ${days} day${days !== 1 ? "s" : ""}`
          }
        />
        <Stat
          label="Company paid"
          icon={Building2}
          value={formatBaseCurrency(summary.companyAmount)}
          sub="Company cards & accounts"
        />
        <Stat
          label="From pocket"
          icon={Wallet}
          tone="amber"
          value={formatBaseCurrency(summary.pocketAmount)}
          sub="Owed to travelers"
        />
        {perTraveller !== null && (
          <Stat
            label="Per traveller"
            icon={Users}
            value={formatBaseCurrency(perTraveller)}
            sub={`Total ÷ ${trip.travelers.length}`}
          />
        )}
        {/* A user's totals cover only their own expenses, so they can't be read against the trip budget. */}
        {isAdmin && trip.budget != null && (
          <BandCell label="Budget">
            <BudgetMeter spent={summary.totalAmount} budget={trip.budget} />
          </BandCell>
        )}
      </StatBand>

      <div className="flex flex-wrap items-start gap-5">
        <Panel
          title="Expenses by day"
          meta={expenses.length > 0 ? `${expenses.length} expense${expenses.length !== 1 ? "s" : ""}` : undefined}
          actions={refreshing ? <InlineLoader label="Refreshing..." /> : undefined}
          flush
          className="grow-[999] basis-[500px] overflow-hidden"
        >
          {expenses.length === 0 ? (
            <div className="border-t border-rule">
              <EmptyState
                icon={<Luggage />}
                title="No expenses on this trip yet"
                description="Log tickets, hotels and meals as they happen, or pull in expenses you've already recorded."
                action={<div className="flex flex-wrap justify-center gap-2">{addButtons}</div>}
              />
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
        </Panel>

        <PanelGrid min={300} className="min-w-0 grow basis-[320px]">
          {summary.expenseCount > 0 && (
            <Panel title="By travel type">
              <p className="-mt-1 mb-3 text-[13px] text-ink-3">
                {isAdmin ? "Where the trip money went." : "Where your money on this trip went."}
              </p>
              <ul className="flex flex-col gap-3">
                {byType.map((row) => {
                  const total = Math.max(row.total, 0);
                  return (
                    <li key={row.travelType ?? "none"} data-testid="type-row">
                      <RankedBar
                        leading={<TravelGlyph type={row.travelType} />}
                        label={
                          <>
                            {travelTypeLabel(row.travelType)}
                            <span className="ml-1.5 text-xs text-ink-3">
                              {row.count} item{row.count !== 1 ? "s" : ""}
                            </span>
                          </>
                        }
                        amount={formatBaseCurrency(row.total)}
                        share={typeTotal > 0 ? (total / typeTotal) * 100 : 0}
                        ratio={typeMax > 0 ? total / typeMax : 0}
                      />
                    </li>
                  );
                })}
              </ul>
            </Panel>
          )}

          {summary.expenseCount > 0 && (
            <Panel title="Who paid">
              <p className="-mt-1 mb-1 text-[13px] text-ink-3">Out-of-pocket spend is what the company owes each person.</p>
              {summary.byPayer.length === 0 ? (
                <p className="py-2 text-sm text-ink-3">No payments recorded yet.</p>
              ) : (
                <ul>
                  {summary.byPayer.map((row) => (
                    <li
                      key={row.user._id}
                      data-testid="payer-row"
                      className="flex items-center gap-3 border-t border-rule-2 py-3 first:border-t-0 last:pb-0"
                    >
                      <PersonAvatar person={row.user} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="ell text-ink">{row.user.name}</span>
                        <span className="num text-xs text-ink-3">
                          {`${formatBaseCurrency(row.totalSpend)} total · ${formatBaseCurrency(row.companySpend)} company`}
                        </span>
                      </span>
                      {row.pocketSpend > 0 ? (
                        <span className="flex shrink-0 flex-col items-end">
                          <span className="cap text-amber">Owed</span>
                          <span className="num font-medium text-amber">{formatBaseCurrency(row.pocketSpend)}</span>
                        </span>
                      ) : (
                        <span className="shrink-0 text-xs text-ink-3">Nothing owed</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}

          <Panel
            title={
              <span className="flex items-center gap-2">
                <Sparkles aria-hidden="true" size={16} strokeWidth={1.5} className="text-accent" />
                Might belong here
              </span>
            }
          >
            <p className="-mt-1 mb-3 text-[13px] text-ink-3">Dated inside the trip, by a traveller, not yet linked.</p>
            {candidates === null ? (
              <Skeleton className="h-[62px] w-full" />
            ) : suggestions.length === 0 ? (
              <p className="text-sm text-ink-3">Nothing unlinked from these dates.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {suggestions.map((expense) => (
                  <li
                    key={expense._id}
                    className="flex items-center gap-3 rounded-control border border-dashed border-accent-line bg-tint p-2.5"
                  >
                    <CategoryGlyph name={expense.category?.name} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="ell font-medium text-ink">{expense.title}</span>
                      <span className="ell text-xs text-ink-3">
                        {expenseDate(expense)} · {expense.createdBy?.name} ·{" "}
                        <span className="num">{formatBaseCurrency(baseAmount(expense))}</span>
                      </span>
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={Plus}
                      loading={adding === expense._id}
                      disabled={adding !== null}
                      onClick={() => handleAddSuggestion(expense)}
                      aria-label={`Add ${expense.title} to this trip`}
                    >
                      Add
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <Button variant="ghost" size="sm" icon={ListPlus} onClick={() => setAddOpen(true)} className="mt-3 self-start">
              Browse all unlinked
            </Button>
          </Panel>
        </PanelGrid>
      </div>

      <TripFormModal isOpen={editOpen} onClose={() => setEditOpen(false)} trip={trip} onSaved={handleTripSaved} />
      <AddExistingExpensesModal
        tripId={trip._id}
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        onAdded={handleAdded}
      />
      <Modal isOpen={deleteOpen} onClose={() => !deleting && setDeleteOpen(false)} title="Delete trip">
        <div className="flex flex-col gap-3 text-sm text-ink-2">
          <p>
            Delete <span className="font-semibold text-ink">{trip.name}</span>?
          </p>
          <p className="rounded-control border border-rule bg-sunk px-3 py-2.5">
            Expenses are kept. They&apos;re just unlinked from this trip and stay in Expenses with their
            receipts and amounts. Their travel type tags are cleared.
          </p>
        </div>
        <div className="-mx-5 mt-5 flex flex-col-reverse gap-2 border-t border-rule px-5 pt-4 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setDeleteOpen(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="danger" icon={Trash2} onClick={handleDeleteTrip} loading={deleting}>
            {deleting ? "Deleting..." : "Delete trip"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
