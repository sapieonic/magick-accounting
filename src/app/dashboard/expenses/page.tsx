"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Building2,
  Calendar,
  ChevronDown,
  Download,
  Luggage,
  MousePointerClick,
  Plus,
  Receipt,
  Search,
  Tag,
  User as UserIcon,
  Wallet,
  X,
} from "lucide-react";
import { format, endOfMonth } from "date-fns";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useTitle } from "@/hooks/useTitle";
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
import Button, { IconButton } from "@/components/ui/Button";
import Field, { inputClass, selectClass } from "@/components/ui/Field";
import StatBand, { Stat } from "@/components/ui/StatBand";
import SplitBar from "@/components/ui/SplitBar";
import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/cn";
import { focusRing, panelClass, transition } from "@/components/ui/styles";
import BandCell from "@/components/expenses/ledger/BandCell";
import ExpenseDetail from "@/components/expenses/ledger/ExpenseDetail";
import ExpenseRow, { LEDGER_CONTAINER, LedgerHead } from "@/components/expenses/ledger/ExpenseRow";
import { baseAmount, expenseEditHref } from "@/components/expenses/ledger/format";
import { useMediaQuery } from "@/components/expenses/ledger/useMediaQuery";
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
/** Company vs pocket spend of the filtered expenses (base currency). */
interface PaymentSplit { company: number; pocket: number }

const CUSTOM_DATE_PRESET = "custom";
const PAGE_SIZE = 25;
const EXPORT_LIMIT = 10000;
const UNDO_WINDOW_MS = 5000;
/** Wide enough for the ledger plus the detail side panel. */
const SIDE_PANEL_QUERY = "(min-width: 1280px)";
const DETAIL_PANEL_ID = "expense-detail-panel";

function getDatePresetOptions(): { value: string; label: string }[] {
  const options = [{ value: "", label: "All time" }];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    options.push({
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: format(d, "MMMM yyyy"),
    });
  }
  options.push({ value: CUSTOM_DATE_PRESET, label: "Custom range" });
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

/** An active filter, shown as a chip that removes it. */
function FilterChip({ children, onRemove }: { children: ReactNode; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className={cn(
        "inline-flex h-10 max-w-full cursor-pointer items-center gap-1.5 rounded-control border border-accent-line bg-accent-soft pl-3 pr-2 text-[13px] font-medium text-accent hover:bg-tint-2",
        transition,
        focusRing
      )}
    >
      <span className="ell">{children}</span>
      <X aria-hidden="true" size={14} strokeWidth={1.75} className="shrink-0" />
      <span className="sr-only">(remove filter)</span>
    </button>
  );
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
          checked ? "bg-accent" : "bg-rule"
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
  const [split, setSplit] = useState<PaymentSplit | null>(null);
  const [splitRefreshKey, setSplitRefreshKey] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingLookups, setLoadingLookups] = useState(true);
  const [loadingExpenses, setLoadingExpenses] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [refreshingExpenses, setRefreshingExpenses] = useState(false);
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
  // company/pocket split reflects the active filters without refetching on "Load more".
  const filterQuery = useMemo(() => buildFilterParams().toString(), [buildFilterParams]);

  // Company vs pocket for the totals band; the list summary only has the total.
  useEffect(() => {
    if (!urlSynced) return;
    let active = true;
    api
      .get(`/api/dashboard/charts?${filterQuery}`)
      .then((data: { paymentSources?: { name: string; total: number }[] }) => {
        if (!active) return;
        const total = (name: string) => data.paymentSources?.find((row) => row.name === name)?.total ?? 0;
        setSplit({ company: total("company"), pocket: total("pocket") });
      })
      .catch(() => {
        // Keep the last good split; the band still shows the total.
      });
    return () => {
      active = false;
    };
  }, [urlSynced, filterQuery, splitRefreshKey]);

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

  // Moves an expense's amounts in or out of the totals band (delete / undo).
  const adjustTotals = (expense: Expense, sign: 1 | -1) => {
    const { pocketBase, companyBase } = getPaymentBreakdown(expense);
    setSummary((prev) => ({
      ...prev,
      totalAmount: prev.totalAmount + sign * baseAmount(expense),
      totalExpenses: Math.max(0, prev.totalExpenses + sign),
    }));
    setSplit((prev) => prev && { company: prev.company + sign * companyBase, pocket: prev.pocket + sign * pocketBase });
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

    // Deleting the last expense of a trip cluster removes the whole row.
    const itemKey = listItemKey(expense);
    const keyOf = listItemKey;
    const rowStaysListed = (list: Expense[]) =>
      list.some((e) => e._id !== expense._id && keyOf(e) === itemKey);

    setExpenses((prev) => prev.filter((e) => e._id !== expense._id));
    adjustTotals(expense, -1);
    if (!rowStaysListed(expenses)) setTotalCount((prev) => Math.max(0, prev - 1));
    if (selectedId === expense._id) setSelectedId(null);

    const restore = () => {
      const rowReappears = !rowStaysListed(expensesRef.current);
      setExpenses((prev) => {
        const next = [...prev];
        next.splice(Math.min(index, next.length), 0, expense);
        return next;
      });
      adjustTotals(expense, 1);
      if (rowReappears) setTotalCount((prev) => prev + 1);
    };

    const timer = setTimeout(async () => {
      if (!pendingDeletes.current.has(expense._id)) return;
      pendingDeletes.current.delete(expense._id);
      try {
        await api.delete(`/api/expenses/${expense._id}`);
        setSplitRefreshKey((key) => key + 1);
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
          <div className="relative min-w-0 flex-[3_1_240px]">
            <Field label="Search" icon={Search}>
              <input
                type="text"
                placeholder="Title, vendor, note"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className={cn(inputClass, "pr-11")}
              />
            </Field>
            {searchInput && (
              <IconButton
                icon={X}
                size="sm"
                onClick={() => setSearchInput("")}
                aria-label="Clear search"
                className="absolute bottom-0.5 right-0.5"
              />
            )}
          </div>
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
            />
          </Field>
          <Field label="Category" icon={Tag} className="flex-[1_1_150px]">
            <MultiSelect
              options={categories.map((c) => ({ value: c._id, label: c.name }))}
              selected={filterCats}
              onChange={setFilterCats}
              placeholder={`All ${categories.length}`}
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
                title="Expenses counted towards this person on Spend by User"
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
            {hasDateFilter && <FilterChip onRemove={clearDateFilter}>{periodLabel}</FilterChip>}
            {filterDepts.map((id) => (
              <FilterChip key={id} onRemove={() => setFilterDepts((prev) => prev.filter((v) => v !== id))}>
                {departments.find((d) => d._id === id)?.name}
              </FilterChip>
            ))}
            {filterCats.map((id) => (
              <FilterChip key={id} onRemove={() => setFilterCats((prev) => prev.filter((v) => v !== id))}>
                {categories.find((c) => c._id === id)?.name}
              </FilterChip>
            ))}
            {filterUser && <FilterChip onRemove={() => setFilterUser("")}>Submitted by {userName(filterUser)}</FilterChip>}
            {filterPayer && <FilterChip onRemove={() => setFilterPayer("")}>Paid by {userName(filterPayer)}</FilterChip>}
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
          {split ? (
            <SplitBar company={split.company} pocket={split.pocket} />
          ) : (
            <Skeleton className="h-3.5 w-full" />
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
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule px-4 py-2.5 text-[13px] text-ink-3">
                <span>
                  {groupTrips
                    ? `Showing ${listItems.length} of ${totalCount} item${totalCount !== 1 ? "s" : ""} · each trip counts as one`
                    : `Showing ${listItems.length} of ${totalCount} expense${totalCount !== 1 ? "s" : ""}`}
                </span>
                {listItems.length < totalCount && (
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
              "sticky top-4 flex max-h-[calc(100dvh-2rem)] min-w-0 grow basis-[340px] flex-col overflow-y-auto"
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
