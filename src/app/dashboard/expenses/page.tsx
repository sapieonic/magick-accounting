"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useTitle } from "@/hooks/useTitle";
import { useToast } from "@/components/ui/Toast";
import { InlineLoader } from "@/components/ui/Spinner";
import Spinner from "@/components/ui/Spinner";
import EmptyState from "@/components/ui/EmptyState";
import MultiSelect from "@/components/ui/MultiSelect";
import { ExpenseListSkeleton } from "@/components/ui/Skeleton";
import {
  Plus, Receipt, Download, Plane,
  Search, Filter, ChevronDown,
  Calendar, TrendingUp, User as UserIcon, Tag, Wallet, X as XIcon,
} from "lucide-react";
import { format, endOfMonth } from "date-fns";
import { formatBaseCurrency } from "@/lib/currency";
import { buildCsv, downloadCsv } from "@/lib/csv";
import { EXPENSE_CSV_HEADERS, expenseCsvRow } from "@/lib/expense-csv";
import { ExpenseAnalytics } from "@/components/dashboard/ExpenseAnalytics";
import ExpenseCard from "@/components/expenses/ExpenseCard";
import TripCluster, { buildExpenseListItems, tripItemKey } from "@/components/trips/TripCluster";
import type { ExpenseListItem } from "@/types/expense";
import type { TripSummary } from "@/types/trip";

type Expense = ExpenseListItem;

interface Department { _id: string; name: string }
interface Category { _id: string; name: string }
interface UserOption { _id: string; name: string; email: string }
interface ExpenseSummary {
  totalAmount: number;
  totalExpenses: number;
  /** The "Paid by" person's own share of the listed expenses. */
  payerSpend?: { totalSpend: number; pocketSpend: number; companySpend: number };
}

const CUSTOM_DATE_PRESET = "custom";
const PAGE_SIZE = 25;
const EXPORT_LIMIT = 10000;
const UNDO_WINDOW_MS = 5000;

function getDatePresetOptions(): { value: string; label: string }[] {
  const options = [{ value: "", label: "All Time" }];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    options.push({
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: format(d, "MMMM yyyy"),
    });
  }
  options.push({ value: CUSTOM_DATE_PRESET, label: "Custom Range" });
  return options;
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
}

export default function ExpensesPage() {
  useTitle("Expenses");
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  /** Trips on the loaded pages, keyed by id (grouped view only). */
  const [trips, setTrips] = useState<Record<string, TripSummary>>({});
  const [departments, setDepartments] = useState<Department[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);

  /** The open row: an expense id, or `tripItemKey(tripId)` for a trip cluster. */
  const [expandedId, setExpandedId] = useState<string | null>(null);
  /** Expense to open inside the expanded trip cluster (deep links). */
  const [clusterExpenseId, setClusterExpenseId] = useState<string | null>(null);
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
  const [analyticsRefreshKey, setAnalyticsRefreshKey] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingLookups, setLoadingLookups] = useState(true);
  const [loadingExpenses, setLoadingExpenses] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [refreshingExpenses, setRefreshingExpenses] = useState(false);
  const [view, setView] = useState<"list" | "insights">("list");
  const hasLoadedExpenses = useRef(false);
  const pendingExpandId = useRef<string | null>(null);
  const pendingDeletes = useRef(new Map<string, PendingDelete>());
  const expensesRef = useRef<Expense[]>([]);
  expensesRef.current = expenses;

  const datePresetOptions = useMemo(() => getDatePresetOptions(), []);

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
    } else if (month) {
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
    (pageNum: number, limit: number, includeSummary: boolean) => {
      const params = buildFilterParams();
      params.set("page", String(pageNum));
      params.set("limit", String(limit));
      if (includeSummary) params.set("includeSummary", "true");
      return params;
    },
    [buildFilterParams]
  );

  // The same filter fields buildQueryParams uses, MINUS page/limit/summary, so the
  // analytics rail reflects the active filters without refetching on "Load more".
  const filterQuery = useMemo(() => buildFilterParams().toString(), [buildFilterParams]);

  // Commit any deletes still inside their undo window. Called before reloading
  // the list (so the server result matches the UI) and on unmount.
  const flushPendingDeletes = useCallback(async () => {
    const entries = Array.from(pendingDeletes.current.values());
    pendingDeletes.current.clear();
    entries.forEach((entry) => clearTimeout(entry.timer));
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
        const params = buildQueryParams(1, PAGE_SIZE, true);
        if (groupTrips) params.set("groupTrips", "true");
        const data = await api.get(`/api/expenses?${params.toString()}`);
        if (!active) return;

        const loaded: Expense[] = data.expenses;
        const loadedTrips: Record<string, TripSummary> = groupTrips ? data.trips ?? {} : {};
        setExpenses(loaded);
        setTrips(loadedTrips);
        setPage(1);
        setTotalCount(data.pagination?.total ?? loaded.length);
        setSummary(data.summary || { totalAmount: 0, totalExpenses: 0 });

        if (pendingExpandId.current) {
          const target = loaded.find((e) => e._id === pendingExpandId.current);
          const tripId = target?.trip?._id;
          if (target && tripId && loadedTrips[tripId]) {
            // The expense lives inside a trip cluster: open both.
            setExpandedId(tripItemKey(tripId));
            setClusterExpenseId(target._id);
          } else if (target) {
            setExpandedId(target._id);
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

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const params = buildQueryParams(page + 1, PAGE_SIZE, false);
      if (groupTrips) params.set("groupTrips", "true");
      const data = await api.get(`/api/expenses?${params.toString()}`);
      if (groupTrips && data.trips) setTrips((prev) => ({ ...prev, ...data.trips }));
      setExpenses((prev) => {
        const seen = new Set(prev.map((e) => e._id));
        return [...prev, ...data.expenses.filter((e: Expense) => !seen.has(e._id))];
      });
      setPage((p) => p + 1);
      setTotalCount(data.pagination?.total ?? totalCount);
    } catch {
      toast("Failed to load more expenses", "error");
    } finally {
      setLoadingMore(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = buildQueryParams(1, EXPORT_LIMIT, false);
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

  // Optimistically remove the expense and give the user a short undo window
  // before the delete is committed to the server.
  // The list row an expense belongs to: its trip's cluster in the grouped
  // view, else its own row. Pagination counts rows, not expenses.
  const listItemKey = useCallback(
    (expense: Expense) => {
      const tripId = expense.trip?._id;
      return groupTrips && tripId && trips[tripId] ? tripItemKey(tripId) : expense._id;
    },
    [groupTrips, trips]
  );

  const listItems = useMemo(
    () => buildExpenseListItems(expenses, groupTrips ? trips : null),
    [expenses, groupTrips, trips]
  );

  // Optimistically remove the expense and give the user a short undo window
  // before the delete is committed to the server.
  const handleDelete = (expense: Expense) => {
    if ((expense.linkedAssetCount || 0) > 0) {
      toast("Linked asset purchases cannot be deleted from Expenses", "error");
      return;
    }
    const index = expenses.findIndex((e) => e._id === expense._id);
    if (index === -1) return;

    // Deleting the last expense of a trip cluster removes the whole row.
    const itemKey = listItemKey(expense);
    const keyOf = listItemKey;
    const rowStaysListed = (list: Expense[]) =>
      list.some((e) => e._id !== expense._id && keyOf(e) === itemKey);

    setExpenses((prev) => prev.filter((e) => e._id !== expense._id));
    setSummary((prev) => ({
      ...prev,
      totalAmount: prev.totalAmount - (expense.amountInBaseCurrency ?? expense.amount),
      totalExpenses: Math.max(0, prev.totalExpenses - 1),
    }));
    if (!rowStaysListed(expenses)) setTotalCount((prev) => Math.max(0, prev - 1));
    if (expandedId === expense._id) setExpandedId(null);

    const restore = () => {
      const rowReappears = !rowStaysListed(expensesRef.current);
      setExpenses((prev) => {
        const next = [...prev];
        next.splice(Math.min(index, next.length), 0, expense);
        return next;
      });
      setSummary((prev) => ({
        ...prev,
        totalAmount: prev.totalAmount + (expense.amountInBaseCurrency ?? expense.amount),
        totalExpenses: prev.totalExpenses + 1,
      }));
      if (rowReappears) setTotalCount((prev) => prev + 1);
    };

    const timer = setTimeout(async () => {
      if (!pendingDeletes.current.has(expense._id)) return;
      pendingDeletes.current.delete(expense._id);
      try {
        await api.delete(`/api/expenses/${expense._id}`);
        setAnalyticsRefreshKey((key) => key + 1);
      } catch {
        restore();
        toast("Failed to delete expense", "error");
      }
    }, UNDO_WINDOW_MS);

    pendingDeletes.current.set(expense._id, { expense, index, timer });

    toast(`Deleted "${expense.title}"`, "info", {
      durationMs: UNDO_WINDOW_MS,
      action: {
        label: "Undo",
        onClick: () => {
          const pending = pendingDeletes.current.get(expense._id);
          if (!pending) return;
          clearTimeout(pending.timer);
          pendingDeletes.current.delete(expense._id);
          restore();
        },
      },
    });
  };

  const toggleExpand = (key: string) => {
    setExpandedId((prev) => (prev === key ? null : key));
    // A deep-linked expense only opens with its cluster the first time.
    setClusterExpenseId(null);
  };

  const toggleGroupTrips = () => {
    // Keep the open expense open across the switch (it may move in or out of a cluster).
    if (expandedId && !expandedId.startsWith("trip:")) pendingExpandId.current = expandedId;
    else if (clusterExpenseId) pendingExpandId.current = clusterExpenseId;
    setExpandedId(null);
    setClusterExpenseId(null);
    setGroupTrips((prev) => !prev);
  };

  const isFiltered = Boolean(search) || hasAnyFilter;
  const hasClusters = listItems.some((item) => item.kind === "trip");

  if (loadingLookups || loadingExpenses) return <ExpenseListSkeleton />;

  return (
    <div className="animate-fade-in flex h-full min-h-0 flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Expenses</h1>
          <p className="text-sm text-muted-foreground">Manage and track all expenses.</p>
        </div>
        <Link href="/dashboard/expenses/new" className="btn-primary shadow-md shadow-brand-500/20">
          <Plus className="h-4 w-4" />
          Add Expense
        </Link>
      </div>

      {/* Filters — full width so they visibly drive both the list and the analytics rail */}
      <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search expenses..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="input-field pl-10 pr-10"
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:bg-subtle hover:text-foreground"
                aria-label="Clear search"
              >
                <XIcon className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <div className="relative">
              <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-400" />
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <select
                value={datePreset}
                onChange={(e) => setDatePreset(e.target.value)}
                className="input-field w-full appearance-none pl-10 pr-9 text-sm"
                aria-label="Filter by date"
              >
                {datePresetOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <MultiSelect
              options={departments.map((d) => ({ value: d._id, label: d.name }))}
              selected={filterDepts}
              onChange={setFilterDepts}
              placeholder="All Departments"
              ariaLabel="Filter by department"
              icon={<Filter className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-blue-400" />}
            />
            <MultiSelect
              options={categories.map((c) => ({ value: c._id, label: c.name }))}
              selected={filterCats}
              onChange={setFilterCats}
              placeholder="All Categories"
              ariaLabel="Filter by category"
              icon={<Tag className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-amber-400" />}
            />
            {isAdmin && (
              <div className="relative">
                <UserIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-400" />
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <select
                  value={filterUser}
                  onChange={(e) => setFilterUser(e.target.value)}
                  className="input-field w-full appearance-none pl-10 pr-9 text-sm"
                  aria-label="Filter by user"
                >
                  <option value="">All Users</option>
                  {users.map((u) => (
                    <option key={u._id} value={u._id}>{u.name}</option>
                  ))}
                </select>
              </div>
            )}
            {isAdmin && (
              <div className="relative">
                <Wallet className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-rose-400" />
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <select
                  value={filterPayer}
                  onChange={(e) => setFilterPayer(e.target.value)}
                  className="input-field w-full appearance-none pl-10 pr-9 text-sm"
                  aria-label="Filter by payer"
                  title="Expenses counted towards this person on Spend by User"
                >
                  <option value="">Paid by anyone</option>
                  {users.map((u) => (
                    <option key={u._id} value={u._id}>Paid by {u.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Custom date range inputs */}
          {datePreset === CUSTOM_DATE_PRESET && (
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  From
                </label>
                <input
                  type="date"
                  value={customFrom}
                  max={customTo || undefined}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="input-field w-full text-sm"
                  aria-label="From date"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  To
                </label>
                <input
                  type="date"
                  value={customTo}
                  min={customFrom || undefined}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="input-field w-full text-sm"
                  aria-label="To date"
                />
              </div>
            </div>
          )}
        </div>
        {/* Active filter pills */}
        {hasAnyFilter && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <span className="text-xs text-muted-foreground">Filters:</span>
            {hasDateFilter && (
              <button
                onClick={() => {
                  setDatePreset("");
                  setCustomFrom("");
                  setCustomTo("");
                }}
                className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-100 dark:bg-violet-500/10 dark:text-violet-300 dark:hover:bg-violet-500/20"
              >
                {datePreset === CUSTOM_DATE_PRESET
                  ? `${customFrom || "…"} → ${customTo || "…"}`
                  : datePresetOptions.find((o) => o.value === datePreset)?.label}{" "}
                &times;
              </button>
            )}
            {filterDepts.map((id) => (
              <button
                key={id}
                onClick={() => setFilterDepts((prev) => prev.filter((v) => v !== id))}
                className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-blue-500/20"
              >
                {departments.find((d) => d._id === id)?.name} &times;
              </button>
            ))}
            {filterCats.map((id) => (
              <button
                key={id}
                onClick={() => setFilterCats((prev) => prev.filter((v) => v !== id))}
                className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20"
              >
                {categories.find((c) => c._id === id)?.name} &times;
              </button>
            ))}
            {filterUser && (
              <button
                onClick={() => setFilterUser("")}
                className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
              >
                {users.find((u) => u._id === filterUser)?.name} &times;
              </button>
            )}
            {filterPayer && (
              <button
                onClick={() => setFilterPayer("")}
                className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-100 dark:bg-violet-500/10 dark:text-violet-300 dark:hover:bg-violet-500/20"
              >
                Paid by {users.find((u) => u._id === filterPayer)?.name} &times;
              </button>
            )}
          </div>
        )}
      </div>

      {/* Mobile view toggle — hidden at xl where both panes are always visible */}
      <div
        className="flex rounded-xl border border-line bg-surface p-1 xl:hidden"
        role="group"
        aria-label="Toggle between expenses and insights"
      >
        <button
          type="button"
          onClick={() => setView("list")}
          aria-pressed={view === "list"}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
            view === "list"
              ? "bg-brand-500 text-white shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Expenses
        </button>
        <button
          type="button"
          onClick={() => setView("insights")}
          aria-pressed={view === "insights"}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
            view === "insights"
              ? "bg-brand-500 text-white shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Insights
        </button>
      </div>

      {/* Split pane: expense list (left) + live analytics rail (right) */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        {/* Left: summary bar + expense list */}
        <section
          aria-label="Expenses list"
          className={`min-w-0 space-y-6 ${view === "list" ? "" : "hidden"} xl:block xl:min-h-0 xl:overflow-y-auto xl:pr-2`}
        >
          {/* Summary bar — sticky so the total stays visible on long lists */}
          <div className="sticky top-0 z-20 -mx-1 -my-2 bg-background/95 px-1 py-2 backdrop-blur-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100 px-4 py-3 dark:from-emerald-500/10 dark:to-teal-500/10 dark:border-emerald-500/30">
                <div className="rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 p-2 text-white">
                  <TrendingUp className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    {datePreset === CUSTOM_DATE_PRESET
                      ? "Custom Range"
                      : datePreset
                        ? datePresetOptions.find((o) => o.value === datePreset)?.label
                        : "All Time"}{" "}
                    Total
                  </p>
                  <p className="text-lg font-bold tabular-nums text-emerald-900 dark:text-emerald-200">
                    {formatBaseCurrency(summary.totalAmount)}
                  </p>
                </div>
                <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                  {summary.totalExpenses} expense{summary.totalExpenses !== 1 ? "s" : ""}
                </span>
                {refreshingExpenses && <InlineLoader label="Refreshing..." className="ml-1 text-emerald-700 dark:text-emerald-300" />}
              </div>
              {filterPayer && summary.payerSpend && (
                <div className="rounded-xl border border-violet-100 bg-violet-50 px-4 py-3 dark:border-violet-500/30 dark:bg-violet-500/10">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-300">
                    Paid by {users.find((u) => u._id === filterPayer)?.name ?? "this person"}
                  </p>
                  <p className="text-lg font-bold tabular-nums text-violet-900 dark:text-violet-100">
                    {formatBaseCurrency(summary.payerSpend.totalSpend)}
                  </p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {formatBaseCurrency(summary.payerSpend.pocketSpend)} pocket ·{" "}
                    {formatBaseCurrency(summary.payerSpend.companySpend)} company
                  </p>
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={groupTrips}
                  onClick={toggleGroupTrips}
                  className="inline-flex items-center gap-2 rounded-xl border border-line-strong bg-surface px-3 py-2.5 text-sm font-semibold text-foreground shadow-sm transition-all duration-200 hover:bg-subtle focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:ring-offset-background"
                  title={groupTrips ? "Each trip is one expandable row. Switch off for a flat list." : "Show each trip's expenses as one expandable row"}
                >
                  <Plane className="h-4 w-4 text-sky-500" aria-hidden="true" />
                  Group trips
                  <span
                    aria-hidden="true"
                    className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors duration-200 ${
                      groupTrips ? "bg-brand-500" : "bg-line-strong"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                        groupTrips ? "translate-x-[18px]" : "translate-x-0.5"
                      }`}
                    />
                  </span>
                </button>
                <button
                  onClick={handleExport}
                  disabled={exporting || expenses.length === 0}
                  className="btn-secondary text-sm"
                  title="Download the currently filtered expenses as CSV"
                >
                  {exporting ? <Spinner size="sm" /> : <Download className="h-4 w-4" />}
                  Export CSV
                </button>
              </div>
            </div>
          </div>

          {listItems.length === 0 ? (
            <EmptyState
              icon={<Receipt className="h-8 w-8" />}
              title={refreshingExpenses ? "Updating expenses..." : "No expenses found"}
              description={search || hasAnyFilter ? "Try adjusting your filters." : "Create your first expense to get started."}
              action={
                !search && !hasAnyFilter ? (
                  <Link href="/dashboard/expenses/new" className="btn-primary">
                    <Plus className="h-4 w-4" />
                    Add Expense
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <div className="space-y-2.5">
              {listItems.map((item) =>
                item.kind === "trip" ? (
                  <TripCluster
                    key={item.key}
                    trip={item.trip}
                    expenses={item.expenses}
                    expanded={expandedId === item.key}
                    onToggle={() => toggleExpand(item.key)}
                    onDelete={handleDelete}
                    initialExpandedId={expandedId === item.key ? clusterExpenseId : null}
                    filtered={isFiltered}
                  />
                ) : (
                  <ExpenseCard
                    key={item.key}
                    expense={item.expense}
                    expanded={expandedId === item.key}
                    onToggle={() => toggleExpand(item.key)}
                    onDelete={handleDelete}
                    showTripBadge={!groupTrips}
                  />
                )
              )}

          {/* Pagination */}
          <div className="flex flex-col items-center gap-3 pt-3">
            <p className="text-xs text-muted-foreground">
              {hasClusters
                ? `Showing ${listItems.length} of ${totalCount} item${totalCount !== 1 ? "s" : ""} · each trip counts as one`
                : `Showing ${listItems.length} of ${totalCount} expense${totalCount !== 1 ? "s" : ""}`}
            </p>
            {listItems.length < totalCount && (
              <button onClick={loadMore} disabled={loadingMore} className="btn-secondary text-sm">
                {loadingMore ? (
                  <>
                    <Spinner size="sm" /> Loading...
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4" />
                    Load more
                  </>
                )}
              </button>
            )}
          </div>
            </div>
          )}
        </section>

        {/* Right: live analytics rail driven by the same filters as the list */}
        <aside
          aria-label="Expense analytics"
          className={`min-w-0 ${view === "insights" ? "" : "hidden"} xl:block xl:min-h-0 xl:overflow-y-auto xl:pr-2`}
        >
          <ExpenseAnalytics filterQuery={filterQuery} refreshKey={analyticsRefreshKey} />
        </aside>
      </div>
    </div>
  );
}
