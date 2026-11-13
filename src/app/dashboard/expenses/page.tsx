"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  Calendar,
  ChevronDown,
  Download,
  Luggage,
  MousePointerClick,
  Plus,
  Receipt,
  Tag,
  User as UserIcon,
  Wallet,
} from "lucide-react";
import { format, endOfMonth } from "date-fns";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useTitle } from "@/hooks/useTitle";
import { roundMoney } from "@/lib/asset";
import { formatBaseCurrency } from "@/lib/currency";
import { buildCsv, downloadCsv } from "@/lib/csv";
import { getPaymentBreakdown } from "@/lib/expense";
import { EXPENSE_CSV_HEADERS, expenseCsvRow } from "@/lib/expense-csv";
import { useToast } from "@/components/ui/Toast";
import { InlineLoader } from "@/components/ui/Spinner";
import EmptyState from "@/components/ui/EmptyState";
import MultiSelect from "@/components/ui/MultiSelect";
import { ExpenseListSkeleton } from "@/components/ui/Skeleton";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Field, { inputClass, selectClass } from "@/components/ui/Field";
import SearchInput from "@/components/ui/SearchInput";
import { RemovableChip } from "@/components/ui/Badge";
import StatBand, { BandCell, Stat } from "@/components/ui/StatBand";
import SplitBar from "@/components/ui/SplitBar";
import { cn } from "@/components/ui/cn";
import { focusRing, panelClass, panelPadX, transition } from "@/components/ui/styles";
import ExpenseDetail from "@/components/expenses/ledger/ExpenseDetail";
import ExpenseRow, { LEDGER_CONTAINER, LedgerHead } from "@/components/expenses/ledger/ExpenseRow";
import { baseAmount, expenseEditHref, payerShare } from "@/components/expenses/ledger/format";
import { monthFromKey } from "@/lib/month";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import TripCluster, { buildExpenseListItems, pageItemKey, tripItemKey } from "@/components/trips/TripCluster";
import type { ExpenseListItem } from "@/types/expense";
import type { TripSummary } from "@/types/trip";

type Expense = ExpenseListItem;

interface Department { _id: string; name: string }
interface Category { _id: string; name: string }
interface UserOption { _id: string; name: string; email: string }
interface ExpenseSummary {
  totalAmount: number;
  totalExpenses: number;
  /** Company vs pocket spend of the filtered expenses (base currency); absent until loaded. */
  companyAmount?: number;
  pocketAmount?: number;
  /** The "Paid by" person's own share of the listed expenses. */
  payerSpend?: { totalSpend: number; pocketSpend: number; companySpend: number };
}

const CUSTOM_DATE_PRESET = "custom";
const PAGE_SIZE = 25;
const EXPORT_LIMIT = 10000;
const UNDO_WINDOW_MS = 5000;
/** Wide enough for the ledger plus the detail side panel. */
const SIDE_PANEL_QUERY = "(min-width: 1280px)";
const DETAIL_PANEL_ID = "expense-detail-panel";

/** A month preset, "YYYY-MM". */
const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * All time, the last 12 months (newest first) and Custom range. `selected`, a
 * month outside those 12 (e.g. a bookmarked `?month=`), is listed in order too.
 */
function getDatePresetOptions(selected = ""): { value: string; label: string }[] {
  const now = new Date();
  const months = new Set<string>();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  if (MONTH_KEY.test(selected)) months.add(selected);
  return [
    { value: "", label: "All time" },
    // "YYYY-MM" keys sort chronologically as strings.
    ...[...months].sort().reverse().map((key) => ({ value: key, label: format(monthFromKey(key), "MMMM yyyy") })),
    { value: CUSTOM_DATE_PRESET, label: "Custom range" },
  ];
}

// Resolves the active date preset / custom range into { from, to } yyyy-MM-dd
// strings for the expense query. Returns empty strings when no bound applies.
function resolveDateRange(
  preset: string,
  customFrom: string,
  customTo: string
): { from: string; to: string } {
  if (preset === CUSTOM_DATE_PRESET) {
    return { from: customFrom, to: customTo };
  }
  if (preset) {
    const [year, month] = preset.split("-").map(Number);
    const monthStart = new Date(year, month - 1, 1);
    return {
      from: format(monthStart, "yyyy-MM-dd"),
      to: format(endOfMonth(monthStart), "yyyy-MM-dd"),
    };
  }
  return { from: "", to: "" };
}

interface PendingDelete {
  expense: Expense;
  index: number;
  timer: ReturnType<typeof setTimeout>;
  /** The undo window is over and the DELETE request is on its way. */
  committing: boolean;
}

/** Adds two base-currency amounts without float drift (or a "-₹0.00"). */
function addMoney(a: number, b: number): number {
  return roundMoney(a + b) || 0;
}

/** On/off switch for the "Group trips" view. */
function GroupTripsSwitch({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onToggle}
      title={checked ? "Each trip is one expandable row. Switch off for a flat list." : "Show each trip's expenses as one expandable row"}
      className={cn(
        "inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-control px-1 text-sm text-ink",
        focusRing
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full",
          transition,
          // Off, the track needs the control boundary's 3:1 contrast too.
          checked ? "bg-accent" : "bg-control-line"
        )}
      >
        <span
          className={cn(
            "inline-block h-4 w-4 rounded-full bg-surface transition-transform duration-140",
            checked ? "translate-x-[18px]" : "translate-x-0.5"
          )}
        />
      </span>
      <Luggage aria-hidden="true" size={16} strokeWidth={1.6} className="text-cat-tr" />
      Group trips
    </button>
  );
}

export default function ExpensesPage() {
  useTitle("Expenses");
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const sidePanel = useMediaQuery(SIDE_PANEL_QUERY);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  /** Trips on the loaded pages, keyed by id (grouped view only). */
  const [trips, setTrips] = useState<Record<string, TripSummary>>({});
  const [departments, setDepartments] = useState<Department[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);

  /** The open expense: its detail shows in the side panel, or under its row. */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** The expanded trip cluster, as `tripItemKey(tripId)`. */
  const [openTripKey, setOpenTripKey] = useState<string | null>(null);
  /** Show each trip's expenses as one expandable row (`?view=flat` turns it off). */
  const [groupTrips, setGroupTrips] = useState(true);

  const [filterDepts, setFilterDepts] = useState<string[]>([]);
  const [filterCats, setFilterCats] = useState<string[]>([]);
  const [datePreset, setDatePreset] = useState("");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [filterUser, setFilterUser] = useState("");
  const [filterPayer, setFilterPayer] = useState("");
  const [urlSynced, setUrlSynced] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [summary, setSummary] = useState<ExpenseSummary>({ totalAmount: 0, totalExpenses: 0 });
  /** Items in the whole list, as the server counts them, less optimistic deletes. */
  const [totalCount, setTotalCount] = useState(0);
  /** The server has items after the loaded ones. */
  const [hasMore, setHasMore] = useState(false);
  const [loadingLookups, setLoadingLookups] = useState(true);
  const [loadingExpenses, setLoadingExpenses] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [refreshingExpenses, setRefreshingExpenses] = useState(false);
  const hasLoadedExpenses = useRef(false);
  const pendingExpandId = useRef<string | null>(null);
  const pendingDeletes = useRef(new Map<string, PendingDelete>());
  /** Where the next page starts on the server: items loaded, less those deleted since. */
  const nextOffset = useRef(0);
  const expensesRef = useRef<Expense[]>([]);
  expensesRef.current = expenses;

  const datePresetOptions = useMemo(() => getDatePresetOptions(datePreset), [datePreset]);

  const hasDateFilter =
    datePreset === CUSTOM_DATE_PRESET ? Boolean(customFrom || customTo) : Boolean(datePreset);
  const hasAnyFilter =
    filterDepts.length > 0 ||
    filterCats.length > 0 ||
    hasDateFilter ||
    Boolean(filterUser) ||
    Boolean(filterPayer);

  // Restore filter state from the URL on first mount so filtered views are
  // shareable and survive refresh / back navigation.
  useEffect(() => {
    if (typeof window === "undefined") {
      setUrlSynced(true);
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const depts = params.getAll("department").flatMap((v) => v.split(",")).filter(Boolean);
    const cats = params.getAll("category").flatMap((v) => v.split(",")).filter(Boolean);
    setFilterDepts(depts);
    setFilterCats(cats);
    setFilterUser(params.get("createdBy") ?? "");
    setFilterPayer(params.get("paidBy") ?? "");

    const month = params.get("month") ?? "";
    const from = params.get("from") ?? "";
    const to = params.get("to") ?? "";
    if (month === CUSTOM_DATE_PRESET || (!month && (from || to))) {
      setDatePreset(CUSTOM_DATE_PRESET);
      setCustomFrom(from);
      setCustomTo(to);
    } else if (MONTH_KEY.test(month)) {
      // Anything else isn't a month (it would break the date range): show all time.
      setDatePreset(month);
    }

    const q = params.get("q") ?? "";
    if (q) {
      setSearchInput(q);
      setSearch(q);
    }

    setGroupTrips(params.get("view") !== "flat");
    pendingExpandId.current = params.get("expand");
    setUrlSynced(true);
  }, []);

  // Mirror filter state back into the URL (replaceState avoids a server
  // round-trip and keeps the back stack clean).
  useEffect(() => {
    if (!urlSynced || typeof window === "undefined") return;

    const params = new URLSearchParams();
    filterDepts.forEach((id) => params.append("department", id));
    filterCats.forEach((id) => params.append("category", id));
    if (filterUser) params.set("createdBy", filterUser);
    if (filterPayer) params.set("paidBy", filterPayer);
    if (datePreset === CUSTOM_DATE_PRESET) {
      params.set("month", CUSTOM_DATE_PRESET);
      if (customFrom) params.set("from", customFrom);
      if (customTo) params.set("to", customTo);
    } else if (datePreset) {
      params.set("month", datePreset);
    }
    if (search) params.set("q", search);
    if (!groupTrips) params.set("view", "flat");

    const query = params.toString();
    const url = query ? `${window.location.pathname}?${query}` : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, [urlSynced, filterDepts, filterCats, filterUser, filterPayer, datePreset, customFrom, customTo, search, groupTrips]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setSearch(searchInput.trim());
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [searchInput]);

  useEffect(() => {
    let active = true;

    async function loadLookups() {
      try {
        const data = await api.get("/api/lookups?include=departments,categories");
        if (!active) return;

        setDepartments(data.departments);
        setCategories(data.categories);
      } catch {
        if (active) {
          toast("Failed to load filters", "error");
        }
      } finally {
        if (active) {
          setLoadingLookups(false);
        }
      }
    }

    loadLookups();
    return () => {
      active = false;
    };
  }, [toast]);

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;

    async function loadUsers() {
      try {
        const data = await api.get("/api/users");
        if (!active) return;
        setUsers(data.users);
      } catch {
        // Non-critical: filter just won't be populated
      }
    }

    loadUsers();
    return () => {
      active = false;
    };
  }, [isAdmin]);

  const buildFilterParams = useCallback(() => {
    const params = new URLSearchParams();

    filterDepts.forEach((id) => params.append("department", id));
    filterCats.forEach((id) => params.append("category", id));
    if (filterUser) params.set("createdBy", filterUser);
    if (filterPayer) params.set("paidBy", filterPayer);
    if (search) params.set("search", search);

    const { from, to } = resolveDateRange(datePreset, customFrom, customTo);
    if (from) params.set("from", from);
    if (to) params.set("to", to);

    return params;
  }, [filterDepts, filterCats, filterUser, filterPayer, search, datePreset, customFrom, customTo]);

  const buildQueryParams = useCallback(
    (offset: number, limit: number, includeSummary: boolean) => {
      const params = buildFilterParams();
      params.set("offset", String(offset));
      params.set("limit", String(limit));
      if (includeSummary) params.set("includeSummary", "true");
      return params;
    },
    [buildFilterParams]
  );

  // Commit any deletes still inside their undo window. Called before reloading
  // the list (so the server result matches the UI) and on unmount.
  // (Deletes already committing finish on their own.)
  const flushPendingDeletes = useCallback(async () => {
    const entries = Array.from(pendingDeletes.current.values()).filter((entry) => !entry.committing);
    entries.forEach((entry) => {
      clearTimeout(entry.timer);
      pendingDeletes.current.delete(entry.expense._id);
    });
    await Promise.allSettled(entries.map((entry) => api.delete(`/api/expenses/${entry.expense._id}`)));
  }, []);

  useEffect(() => {
    const flush = flushPendingDeletes;
    return () => {
      void flush();
    };
  }, [flushPendingDeletes]);

  useEffect(() => {
    if (!urlSynced) return;
    let active = true;
    const initialLoad = !hasLoadedExpenses.current;

    async function loadExpenses() {
      if (initialLoad) {
        setLoadingExpenses(true);
      } else {
        setRefreshingExpenses(true);
      }

      try {
        await flushPendingDeletes();
        const params = buildQueryParams(0, PAGE_SIZE, true);
        if (groupTrips) params.set("groupTrips", "true");
        const data = await api.get(`/api/expenses?${params.toString()}`);
        if (!active) return;

        const loaded: Expense[] = data.expenses;
        const loadedTrips: Record<string, TripSummary> = groupTrips ? data.trips ?? {} : {};
        setExpenses(loaded);
        setTrips(loadedTrips);
        setTotalCount(data.pagination?.total ?? loaded.length);
        setHasMore(Boolean(data.pagination?.hasMore));
        nextOffset.current = data.pagination?.nextOffset ?? loaded.length;
        setSummary(data.summary || { totalAmount: 0, totalExpenses: 0 });

        if (pendingExpandId.current) {
          const target = loaded.find((e) => e._id === pendingExpandId.current);
          const tripId = target?.trip?._id;
          if (target) {
            // An expense inside a trip cluster opens with its cluster.
            if (tripId && loadedTrips[tripId]) setOpenTripKey(tripItemKey(tripId));
            setSelectedId(target._id);
          }
          pendingExpandId.current = null;
        }
      } catch {
        if (active) {
          toast("Failed to load expenses", "error");
        }
      } finally {
        if (!active) return;

        if (initialLoad) {
          setLoadingExpenses(false);
          hasLoadedExpenses.current = true;
        } else {
          setRefreshingExpenses(false);
        }
      }
    }

    loadExpenses();
    return () => {
      active = false;
    };
  }, [buildQueryParams, flushPendingDeletes, toast, urlSynced, groupTrips]);

  // The item an expense counts towards, as the server pages them.
  const itemKey = useCallback((expense: Expense) => pageItemKey(expense, groupTrips), [groupTrips]);

  // Items whose every listed expense is still inside its undo window: gone
  // from the list, but still counted by the server.
  const pendingRemovedItems = () => {
    const listed = new Set(expensesRef.current.map(itemKey));
    const removed = new Set<string>();
    for (const entry of pendingDeletes.current.values()) {
      const key = itemKey(entry.expense);
      if (!entry.committing && !listed.has(key)) removed.add(key);
    }
    return removed.size;
  };

  // Continues from the server offset rather than the next page number, so
  // deletes since the last page don't make it skip an item.
  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const params = buildQueryParams(nextOffset.current, PAGE_SIZE, false);
      if (groupTrips) params.set("groupTrips", "true");
      const data = await api.get(`/api/expenses?${params.toString()}`);
      if (groupTrips && data.trips) setTrips((prev) => ({ ...prev, ...data.trips }));
      setExpenses((prev) => {
        const seen = new Set(prev.map((e) => e._id));
        return [...prev, ...data.expenses.filter((e: Expense) => !seen.has(e._id))];
      });
      if (data.pagination) {
        nextOffset.current = data.pagination.nextOffset;
        setHasMore(Boolean(data.pagination.hasMore));
        setTotalCount(Math.max(0, data.pagination.total - pendingRemovedItems()));
      }
    } catch {
      toast("Failed to load more expenses", "error");
    } finally {
      setLoadingMore(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = buildQueryParams(0, EXPORT_LIMIT, false);
      const data = await api.get(`/api/expenses?${params.toString()}`);
      const rows = (data.expenses as Expense[]).map(expenseCsvRow);
      const csv = buildCsv(EXPENSE_CSV_HEADERS, rows);
      downloadCsv(`expenses-${format(new Date(), "yyyy-MM-dd")}.csv`, csv);
      toast(`Exported ${rows.length} expense${rows.length !== 1 ? "s" : ""}`);
    } catch {
      toast("Failed to export expenses", "error");
    } finally {
      setExporting(false);
    }
  };

  const listItems = useMemo(
    () => buildExpenseListItems(expenses, groupTrips ? trips : null),
    [expenses, groupTrips, trips]
  );
  // Loaded items as the server counts them (an unopenable trip's rows are one).
  const loadedItemCount = useMemo(() => new Set(expenses.map(itemKey)).size, [expenses, itemKey]);

  // Moves an expense's amounts in or out of the totals band (delete / undo),
  // including the "Paid by" person's share when that filter is on.
  const adjustTotals = (expense: Expense, sign: 1 | -1) => {
    const { pocketBase, companyBase } = getPaymentBreakdown(expense);
    const share = filterPayer ? payerShare(expense, filterPayer) : null;
    setSummary((prev) => ({
      ...prev,
      totalAmount: addMoney(prev.totalAmount, sign * baseAmount(expense)),
      totalExpenses: Math.max(0, prev.totalExpenses + sign),
      ...(prev.companyAmount != null && prev.pocketAmount != null
        ? {
            companyAmount: addMoney(prev.companyAmount, sign * companyBase),
            pocketAmount: addMoney(prev.pocketAmount, sign * pocketBase),
          }
        : {}),
      ...(prev.payerSpend && share
        ? {
            payerSpend: {
              totalSpend: addMoney(prev.payerSpend.totalSpend, sign * (share.pocket + share.company)),
              pocketSpend: addMoney(prev.payerSpend.pocketSpend, sign * share.pocket),
              companySpend: addMoney(prev.payerSpend.companySpend, sign * share.company),
            },
          }
        : {}),
    }));
  };

  // Optimistically remove the expense and give the user a short undo window
  // before the delete is committed to the server.
  const handleDelete = (expense: Expense) => {
    if ((expense.linkedAssetCount || 0) > 0) {
      toast("Linked asset purchases cannot be deleted from Expenses", "error");
      return;
    }
    const index = expenses.findIndex((e) => e._id === expense._id);
    if (index === -1) return;

    // Deleting the last expense of a trip cluster removes the whole item.
    const key = itemKey(expense);
    const itemStaysListed = (list: Expense[]) =>
      list.some((e) => e._id !== expense._id && itemKey(e) === key);

    setExpenses((prev) => prev.filter((e) => e._id !== expense._id));
    adjustTotals(expense, -1);
    if (!itemStaysListed(expenses)) setTotalCount((prev) => Math.max(0, prev - 1));
    if (selectedId === expense._id) setSelectedId(null);

    const restore = () => {
      const itemReappears = !itemStaysListed(expensesRef.current);
      setExpenses((prev) => {
        const next = [...prev];
        next.splice(Math.min(index, next.length), 0, expense);
        return next;
      });
      adjustTotals(expense, 1);
      if (itemReappears) setTotalCount((prev) => prev + 1);
    };

    const commit = async () => {
      const pending = pendingDeletes.current.get(expense._id);
      if (!pending || pending.committing) return;
      pending.committing = true;
      // The server item goes with its last expense; siblings still in their
      // undo window keep it. Moving the offset first errs towards loading an
      // item twice (de-duplicated) rather than skipping one.
      const removesItem =
        !itemStaysListed(expensesRef.current) &&
        ![...pendingDeletes.current.values()].some(
          (entry) => !entry.committing && itemKey(entry.expense) === key
        );
      if (removesItem) nextOffset.current = Math.max(0, nextOffset.current - 1);
      try {
        await api.delete(`/api/expenses/${expense._id}`);
      } catch {
        if (removesItem) nextOffset.current += 1;
        restore();
        toast("Failed to delete expense", "error");
      } finally {
        pendingDeletes.current.delete(expense._id);
      }
    };

    const timer = setTimeout(() => void commit(), UNDO_WINDOW_MS);
    pendingDeletes.current.set(expense._id, { expense, index, timer, committing: false });

    toast(`Deleted "${expense.title}"`, "info", {
      durationMs: UNDO_WINDOW_MS,
      action: {
        label: "Undo",
        onClick: () => {
          const pending = pendingDeletes.current.get(expense._id);
          if (!pending || pending.committing) return;
          clearTimeout(pending.timer);
          pendingDeletes.current.delete(expense._id);
          restore();
        },
      },
    });
  };

  const toggleSelected = (expense: Expense | null) => {
    setSelectedId((prev) => (expense && prev !== expense._id ? expense._id : null));
  };

  const toggleTrip = (key: string) => {
    setOpenTripKey((prev) => (prev === key ? null : key));
  };

  const toggleGroupTrips = () => {
    // Keep the open expense open across the switch (it may move in or out of a cluster).
    pendingExpandId.current = selectedId;
    setSelectedId(null);
    setOpenTripKey(null);
    setGroupTrips((prev) => !prev);
  };

  const clearDateFilter = () => {
    setDatePreset("");
    setCustomFrom("");
    setCustomTo("");
  };

  const isFiltered = Boolean(search) || hasAnyFilter;
  const selectedExpense = selectedId ? expenses.find((e) => e._id === selectedId) ?? null : null;

  if (loadingLookups || loadingExpenses) return <ExpenseListSkeleton />;

  const periodLabel =
    datePreset === CUSTOM_DATE_PRESET
      ? `${customFrom || "…"} → ${customTo || "…"}`
      : datePresetOptions.find((o) => o.value === datePreset)?.label ?? "All time";
  const userName = (id: string) => users.find((u) => u._id === id)?.name;
  const payerLabel = userName(filterPayer) ?? "this person";

  return (
    <div className="animate-fade-in flex flex-col gap-6">
      <PageHeader
        title="Expenses"
        meta={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            {isAdmin ? "Everyone" : "Your expenses"} · {periodLabel}
            {refreshingExpenses && <InlineLoader label="Refreshing..." />}
          </span>
        }
        actions={
          <>
            <Button
              variant="secondary"
              icon={Download}
              loading={exporting}
              onClick={handleExport}
              disabled={expenses.length === 0}
              title="Download the currently filtered expenses as CSV"
            >
              Export CSV
            </Button>
            <Button icon={Plus} href="/dashboard/expenses/new">
              New expense
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-3">
        <form
          aria-label="Filters"
          onSubmit={(e) => e.preventDefault()}
          className="flex flex-wrap items-end gap-3"
        >
          <Field label="Search" className="flex-[3_1_240px]">
            <SearchInput value={searchInput} onValueChange={setSearchInput} placeholder="Title, vendor, note" />
          </Field>
          <Field label="Dates" icon={Calendar} className="flex-[1_1_150px]">
            <select value={datePreset} onChange={(e) => setDatePreset(e.target.value)} className={selectClass}>
              {datePresetOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </Field>
          {datePreset === CUSTOM_DATE_PRESET && (
            <>
              <Field label="From" className="flex-[1_1_150px]">
                <input
                  type="date"
                  value={customFrom}
                  max={customTo || undefined}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="To" className="flex-[1_1_150px]">
                <input
                  type="date"
                  value={customTo}
                  min={customFrom || undefined}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className={inputClass}
                />
              </Field>
            </>
          )}
          <Field label="Department" icon={Building2} className="flex-[1_1_150px]">
            <MultiSelect
              options={departments.map((d) => ({ value: d._id, label: d.name }))}
              selected={filterDepts}
              onChange={setFilterDepts}
              placeholder={`All ${departments.length}`}
              listLabel="Filter by department"
            />
          </Field>
          <Field label="Category" icon={Tag} className="flex-[1_1_150px]">
            <MultiSelect
              options={categories.map((c) => ({ value: c._id, label: c.name }))}
              selected={filterCats}
              onChange={setFilterCats}
              placeholder={`All ${categories.length}`}
              listLabel="Filter by category"
            />
          </Field>
          {isAdmin && (
            <Field label="Submitted by" icon={UserIcon} className="flex-[1_1_150px]">
              <select value={filterUser} onChange={(e) => setFilterUser(e.target.value)} className={selectClass}>
                <option value="">Anyone</option>
                {users.map((u) => (
                  <option key={u._id} value={u._id}>{u.name}</option>
                ))}
              </select>
            </Field>
          )}
          {isAdmin && (
            <Field label="Paid by" icon={Wallet} className="flex-[1_1_150px]">
              <select
                value={filterPayer}
                onChange={(e) => setFilterPayer(e.target.value)}
                className={selectClass}
                title="Expenses counted towards this person in Spend by user"
              >
                <option value="">Anyone</option>
                {users.map((u) => (
                  <option key={u._id} value={u._id}>{u.name}</option>
                ))}
              </select>
            </Field>
          )}
          <GroupTripsSwitch checked={groupTrips} onToggle={toggleGroupTrips} />
        </form>

        {hasAnyFilter && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="cap text-ink-3">Filtered by</span>
            {hasDateFilter && <RemovableChip onRemove={clearDateFilter}>{periodLabel}</RemovableChip>}
            {filterDepts.map((id) => (
              <RemovableChip key={id} onRemove={() => setFilterDepts((prev) => prev.filter((v) => v !== id))}>
                {departments.find((d) => d._id === id)?.name}
              </RemovableChip>
            ))}
            {filterCats.map((id) => (
              <RemovableChip key={id} onRemove={() => setFilterCats((prev) => prev.filter((v) => v !== id))}>
                {categories.find((c) => c._id === id)?.name}
              </RemovableChip>
            ))}
            {filterUser && <RemovableChip onRemove={() => setFilterUser("")}>Submitted by {userName(filterUser)}</RemovableChip>}
            {filterPayer && <RemovableChip onRemove={() => setFilterPayer("")}>Paid by {userName(filterPayer)}</RemovableChip>}
          </div>
        )}
      </div>

      <StatBand>
        <Stat
          headline
          label={`${periodLabel} total`}
          value={formatBaseCurrency(summary.totalAmount)}
          sub={`${summary.totalExpenses} expense${summary.totalExpenses !== 1 ? "s" : ""}`}
        />
        <BandCell label="Company · pocket">
          {summary.companyAmount != null && summary.pocketAmount != null ? (
            <SplitBar company={summary.companyAmount} pocket={summary.pocketAmount} />
          ) : (
            // The list failed to load: nothing to split.
            <span className="text-sm text-ink-3">
              <span aria-hidden="true">—</span>
              <span className="sr-only">Not available</span>
            </span>
          )}
        </BandCell>
        {filterPayer && summary.payerSpend && (
          <Stat
            label={`Paid by ${payerLabel}`}
            icon={UserIcon}
            value={formatBaseCurrency(summary.payerSpend.totalSpend)}
            sub={`${formatBaseCurrency(summary.payerSpend.pocketSpend)} pocket · ${formatBaseCurrency(summary.payerSpend.companySpend)} company`}
          />
        )}
      </StatBand>

      <div className="flex flex-wrap items-start gap-5">
        <section
          aria-label="Expense ledger"
          className={cn(panelClass, LEDGER_CONTAINER, "min-w-0 grow-[999] basis-[520px] overflow-hidden")}
        >
          {listItems.length === 0 ? (
            <EmptyState
              icon={<Receipt />}
              title={refreshingExpenses ? "Updating expenses..." : "No expenses found"}
              description={isFiltered ? "Try adjusting your filters." : "Create your first expense to get started."}
              action={
                !isFiltered ? (
                  <Button icon={Plus} href="/dashboard/expenses/new">
                    Add expense
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <LedgerHead />
              <ul>
                {listItems.map((item) => (
                  <li key={item.key}>
                    {item.kind === "trip" ? (
                      <TripCluster
                        trip={item.trip}
                        expenses={item.expenses}
                        expanded={openTripKey === item.key}
                        onToggle={() => toggleTrip(item.key)}
                        selectedId={selectedId}
                        onSelect={toggleSelected}
                        inlineDetail={!sidePanel}
                        detailId={DETAIL_PANEL_ID}
                        onDelete={handleDelete}
                        filtered={isFiltered}
                      />
                    ) : (
                      <ExpenseRow
                        expense={item.expense}
                        selected={selectedId === item.expense._id}
                        onSelect={() => toggleSelected(item.expense)}
                        inlineDetail={!sidePanel}
                        detailId={DETAIL_PANEL_ID}
                        editHref={expenseEditHref(item.expense._id)}
                        onDelete={handleDelete}
                        showTripLink={!groupTrips}
                      />
                    )}
                  </li>
                ))}
              </ul>
              <div className={cn("flex flex-wrap items-center justify-between gap-3 border-t border-rule py-2.5 text-[13px] text-ink-3", panelPadX)}>
                <span>
                  {groupTrips
                    ? `Showing ${loadedItemCount} of ${totalCount} item${totalCount !== 1 ? "s" : ""} · each trip counts as one`
                    : `Showing ${loadedItemCount} of ${totalCount} expense${totalCount !== 1 ? "s" : ""}`}
                </span>
                {hasMore && (
                  <Button variant="secondary" icon={ChevronDown} loading={loadingMore} onClick={loadMore}>
                    {loadingMore ? "Loading..." : "Load more"}
                  </Button>
                )}
              </div>
            </>
          )}
        </section>

        {sidePanel && (
          <aside
            id={DETAIL_PANEL_ID}
            aria-label="Selected expense"
            className={cn(
              panelClass,
              // <main> scrolls below the 4rem top bar, so the panel fits in
              // 100dvh minus the bar and a 1rem gap above and below.
              "sticky top-4 flex max-h-[calc(100dvh-6rem)] min-w-0 grow basis-[340px] flex-col overflow-y-auto"
            )}
          >
            {selectedExpense ? (
              <ExpenseDetail
                key={selectedExpense._id}
                expense={selectedExpense}
                editHref={expenseEditHref(selectedExpense._id)}
                onDelete={handleDelete}
                onClose={() => setSelectedId(null)}
                showHeader
                className="bg-wash-r p-5"
              />
            ) : (
              <EmptyState
                icon={<MousePointerClick />}
                title="No expense selected"
                description="Pick a row to see its receipt, who paid and what you can do with it."
              />
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
