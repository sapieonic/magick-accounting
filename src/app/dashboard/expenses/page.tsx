"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { APPROVALS_HREF } from "@/components/layout/nav";
import {
  Building2,
  Calendar,
  ChevronDown,
  CircleX,
  ClipboardCheck,
  Clock3,
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
import Link from "next/link";
import { api } from "@/lib/api";
import {
  APPROVAL_LABEL,
  APPROVED_DELETE_MESSAGE,
  canDeleteExpense,
  effectiveApprovalStatus,
  parseApprovalFilter,
  type ApprovalStatus,
} from "@/lib/approval";
import { useAuth } from "@/contexts/AuthContext";
import { useTitle } from "@/hooks/useTitle";
import { UNDO_WINDOW_MS, usePendingDeletes } from "@/hooks/usePendingDeletes";
import { useApprovalActions } from "@/hooks/useApprovalActions";
import { roundMoney } from "@/lib/asset";
import { formatBaseCurrency } from "@/lib/currency";
import { buildCsv, downloadCsv } from "@/lib/csv";
import { MAX_EXPENSE_PAGE, canModifyExpense, payerShare, viewerAmounts, type SpendViewer } from "@/lib/expense";
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
import { focusRing, panelClass, panelPadX, textButtonClass, transition } from "@/components/ui/styles";
import ExpenseDetail from "@/components/expenses/ledger/ExpenseDetail";
import ExpenseDetailPanel from "@/components/expenses/ledger/ExpenseDetailPanel";
import ExpenseRow, { LEDGER_CONTAINER, LedgerHead } from "@/components/expenses/ledger/ExpenseRow";
import {
  DELETE_FAILED,
  DELETE_WHILE_REVIEWING,
  asReviewed,
  deleteRefusal,
  useFocusAfterReview,
} from "@/components/expenses/review-status";
import { expenseEditHref } from "@/components/expenses/ledger/format";
import { MONTH_KEY, monthFromKey, monthKey } from "@/lib/month";
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
  /** The figures above count approved expenses only; these describe the rest. */
  pendingCount?: number;
  pendingAmount?: number;
  rejectedCount?: number;
}

/** The Status filter: "" is every status. */
type ApprovalFilter = ApprovalStatus | "";

const APPROVAL_FILTER_OPTIONS: { value: ApprovalFilter; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "approved", label: APPROVAL_LABEL.approved },
  { value: "pending", label: APPROVAL_LABEL.pending },
  { value: "rejected", label: APPROVAL_LABEL.rejected },
];

const plural = (count: number, noun: string) => `${count} ${noun}${count !== 1 ? "s" : ""}`;

/**
 * `summary` with one expense's amounts added (1) or taken out (-1), including
 * the "Paid by" person's share when that filter is on (`payerId`). Only an
 * approved expense is in the totals; the others move their own counts. The
 * amounts are what the server counts for `viewer` (`viewerAmounts`): whole
 * expenses for an admin, their own share for anyone else, the pending figure
 * included.
 */
function shiftSummary(
  prev: ExpenseSummary,
  expense: Expense,
  sign: 1 | -1,
  payerId: string,
  viewer: SpendViewer
): ExpenseSummary {
  const status = effectiveApprovalStatus(expense);
  const own = viewerAmounts(expense, viewer);
  if (status === "pending") {
    return prev.pendingCount == null && prev.pendingAmount == null
      ? prev
      : {
          ...prev,
          pendingAmount: roundMoney((prev.pendingAmount ?? 0) + sign * own.total),
          pendingCount: Math.max(0, (prev.pendingCount ?? 0) + sign),
        };
  }
  if (status === "rejected") {
    return prev.rejectedCount == null ? prev : { ...prev, rejectedCount: Math.max(0, prev.rejectedCount + sign) };
  }
  const share = payerId ? payerShare(expense, payerId) : null;
  return {
    ...prev,
    totalAmount: roundMoney(prev.totalAmount + sign * own.total),
    totalExpenses: Math.max(0, prev.totalExpenses + sign),
    ...(prev.companyAmount != null && prev.pocketAmount != null
      ? {
          companyAmount: roundMoney(prev.companyAmount + sign * own.company),
          pocketAmount: roundMoney(prev.pocketAmount + sign * own.pocket),
        }
      : {}),
    ...(prev.payerSpend && share
      ? {
          payerSpend: {
            totalSpend: roundMoney(prev.payerSpend.totalSpend + sign * (share.pocket + share.company)),
            pocketSpend: roundMoney(prev.payerSpend.pocketSpend + sign * share.pocket),
            companySpend: roundMoney(prev.payerSpend.companySpend + sign * share.company),
          },
        }
      : {}),
  };
}

const CUSTOM_DATE_PRESET = "custom";
const PAGE_SIZE = 25;
/** Export requests at most, a guard against a server that never says it's done. */
const MAX_EXPORT_PAGES = 50;
/** Wide enough for the ledger plus the detail side panel. */
const SIDE_PANEL_QUERY = "(min-width: 1280px)";
const DETAIL_PANEL_ID = "expense-detail-panel";

/**
 * All time, the last 12 months (newest first) and Custom range. `selected`, a
 * month outside those 12 (e.g. a bookmarked `?month=`), is listed in order too.
 */
function getDatePresetOptions(selected = ""): { value: string; label: string }[] {
  const now = new Date();
  const months = new Set<string>();
  for (let i = 0; i < 12; i++) {
    months.add(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
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
    const monthStart = monthFromKey(preset);
    return {
      from: format(monthStart, "yyyy-MM-dd"),
      to: format(endOfMonth(monthStart), "yyyy-MM-dd"),
    };
  }
  return { from: "", to: "" };
}

const deleteExpense = (id: string) => api.delete(`/api/expenses/${id}`);

/** List params that aren't filters: with only these, the list (and its summary) is every visible expense. */
const NON_FILTER_PARAMS = ["cursor", "limit", "includeSummary", "groupTrips"];

/** An expense opened with `?expand=` that isn't on the loaded pages, shown above the list. */
interface PinnedExpense {
  expense: Expense;
  /** No filters were on, so the list's summary includes it (its review or delete moves the band). */
  counted: boolean;
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
  const { isAdmin, user } = useAuth();
  // How totals count each expense (whole for an admin, their own share for
  // anyone else) and which expenses this person may change.
  const viewer = useMemo<SpendViewer>(
    () => ({ _id: user?._id ?? "", role: user?.role ?? (isAdmin ? "admin" : "user") }),
    [user?._id, user?.role, isAdmin]
  );
  const canModify = useCallback((expense: Expense) => canModifyExpense(expense, viewer), [viewer]);
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
  const [filterApproval, setFilterApproval] = useState<ApprovalFilter>("");
  const [urlSynced, setUrlSynced] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [summary, setSummary] = useState<ExpenseSummary>({ totalAmount: 0, totalExpenses: 0 });
  /** Items in the whole list, as the server first counted them, less deletes since. */
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
  const [pinned, setPinned] = useState<PinnedExpense | null>(null);
  const pinnedRef = useRef<PinnedExpense | null>(null);
  pinnedRef.current = pinned;
  /** Where focus goes after a review when its row has left the list. */
  const ledgerRef = useRef<HTMLElement | null>(null);
  const focusAfterReview = useFocusAfterReview(ledgerRef);
  const { schedule: scheduleDelete, undo: undoDelete, flush: flushPendingDeletes } = usePendingDeletes(deleteExpense);
  /** Takes an expense out of the list (and the item count, once its item is empty). */
  const dropExpense = (expense: Expense) => {
    const key = pageItemKey(expense, groupTrips);
    const itemStays = expensesRef.current.some((e) => e._id !== expense._id && pageItemKey(e, groupTrips) === key);
    setExpenses((prev) => prev.filter((e) => e._id !== expense._id));
    if (!itemStays) setTotalCount((prev) => Math.max(0, prev - 1));
    setSelectedId((prev) => (prev === expense._id ? null : prev));
  };
  // Approve / reject (admins) and resubmit (submitters) from the detail. The
  // band follows each status change; a row that no longer matches the Status
  // filter leaves the list.
  const review = useApprovalActions({
    onScheduled: (reviewed) => focusAfterReview(reviewed),
    onMovedToReview: (expense) => focusAfterReview([expense]),
    onUpdated: (updated) => {
      const old = expensesRef.current.find((e) => e._id === updated._id);
      const pin = pinnedRef.current;
      if (!old && pin?.expense._id === updated._id) {
        // Opened from a link, beyond the loaded pages: still part of the summary when unfiltered.
        if (pin.counted) {
          setSummary((prev) => shiftSummary(shiftSummary(prev, pin.expense, -1, filterPayer, viewer), updated, 1, filterPayer, viewer));
        }
        setPinned({ ...pin, expense: updated });
        return;
      }
      if (!old) return;
      const drop = Boolean(filterApproval) && effectiveApprovalStatus(updated) !== filterApproval;
      setSummary((prev) => {
        const without = shiftSummary(prev, old, -1, filterPayer, viewer);
        return drop ? without : shiftSummary(without, updated, 1, filterPayer, viewer);
      });
      if (drop) dropExpense(old);
      else setExpenses((prev) => prev.map((e) => (e._id === updated._id ? updated : e)));
    },
    onRemoved: (id) => {
      const old = expensesRef.current.find((e) => e._id === id);
      const pin = pinnedRef.current;
      if (!old && pin?.expense._id === id) {
        if (pin.counted) setSummary((prev) => shiftSummary(prev, pin.expense, -1, filterPayer, viewer));
        setPinned(null);
        setSelectedId((prev) => (prev === id ? null : prev));
        return;
      }
      if (!old) return;
      setSummary((prev) => shiftSummary(prev, old, -1, filterPayer, viewer));
      dropExpense(old);
    },
  });
  const { flush: flushReviews, inFlight, refresh: refreshExpense } = review;
  /** Expenses whose delete the server refused, to re-read once they are back in the list. */
  const [toReread, setToReread] = useState<Expense[]>([]);
  useEffect(() => {
    if (toReread.length === 0) return;
    setToReread([]);
    for (const expense of toReread) void refreshExpense(expense);
  }, [toReread, refreshExpense]);
  /** The server's cursor for the page after the loaded ones. */
  const nextCursor = useRef<string | null>(null);
  /**
   * Bumped when a reload starts and when it lands: a Load more begun under an
   * earlier generation belongs to another query (or cursor) and is dropped.
   */
  const listGeneration = useRef(0);
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
    Boolean(filterPayer) ||
    Boolean(filterApproval);

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
    setFilterApproval(parseApprovalFilter(params.get("approval")) ?? "");

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
    if (filterApproval) params.set("approval", filterApproval);
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
  }, [
    urlSynced,
    filterDepts,
    filterCats,
    filterUser,
    filterPayer,
    filterApproval,
    datePreset,
    customFrom,
    customTo,
    search,
    groupTrips,
  ]);

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
    if (filterApproval) params.set("approval", filterApproval);
    if (search) params.set("search", search);

    const { from, to } = resolveDateRange(datePreset, customFrom, customTo);
    if (from) params.set("from", from);
    if (to) params.set("to", to);

    return params;
  }, [filterDepts, filterCats, filterUser, filterPayer, filterApproval, search, datePreset, customFrom, customTo]);

  const buildQueryParams = useCallback(
    (cursor: string | null, limit: number, includeSummary: boolean) => {
      const params = buildFilterParams();
      if (cursor) params.set("cursor", cursor);
      params.set("limit", String(limit));
      if (includeSummary) params.set("includeSummary", "true");
      return params;
    },
    [buildFilterParams]
  );

  useEffect(() => {
    if (!urlSynced) return;
    let active = true;
    const initialLoad = !hasLoadedExpenses.current;
    // A Load more still in flight is for the previous list.
    listGeneration.current += 1;
    setLoadingMore(false);

    async function loadExpenses() {
      if (initialLoad) {
        setLoadingExpenses(true);
      } else {
        setRefreshingExpenses(true);
      }

      try {
        // Commit deletes still in their undo window first, so the server result matches the UI.
        await Promise.all([flushPendingDeletes(), flushReviews()]);
        const params = buildQueryParams(null, PAGE_SIZE, true);
        if (groupTrips) params.set("groupTrips", "true");
        const data = await api.get(`/api/expenses?${params.toString()}`);
        if (!active) return;

        const loaded: Expense[] = data.expenses;
        const loadedTrips: Record<string, TripSummary> = groupTrips ? data.trips ?? {} : {};
        setExpenses(loaded);
        setTrips(loadedTrips);
        setTotalCount(data.pagination?.total ?? loaded.length);
        setHasMore(Boolean(data.pagination?.hasMore));
        nextCursor.current = data.pagination?.nextCursor ?? null;
        setSummary(data.summary || { totalAmount: 0, totalExpenses: 0 });

        // A reload is a new list: an expense pinned from a link goes with the old one.
        setPinned(null);
        const expandId = pendingExpandId.current;
        pendingExpandId.current = null;
        if (expandId) {
          const target = loaded.find((e) => e._id === expandId);
          const tripId = target?.trip?._id;
          if (target) {
            // An expense inside a trip cluster opens with its cluster.
            if (tripId && loadedTrips[tripId]) setOpenTripKey(tripItemKey(tripId));
            setSelectedId(target._id);
          } else {
            // Not on the first page (e.g. just created, dated earlier): fetch it and
            // show it above the list, so the link opens what it promised.
            const filterKeys = [...params.keys()].filter((key) => !NON_FILTER_PARAMS.includes(key));
            try {
              const one: { expense?: Expense; assets?: unknown[] } = await api.get(`/api/expenses/${expandId}`);
              if (!active) return;
              if (one?.expense) {
                setPinned({
                  expense: { ...one.expense, linkedAssetCount: one.assets?.length ?? one.expense.linkedAssetCount ?? 0 },
                  counted: filterKeys.length === 0,
                });
                setSelectedId(expandId);
              }
            } catch {
              if (active) toast("That expense couldn't be opened. It may have been deleted.", "info");
            }
          }
        }
      } catch {
        if (active) {
          toast("Failed to load expenses", "error");
        }
      } finally {
        if (!active) return;
        // Also drops a Load more begun while this reload ran (it used the old cursor).
        listGeneration.current += 1;
        setLoadingMore(false);

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
  }, [buildQueryParams, flushPendingDeletes, flushReviews, toast, urlSynced, groupTrips]);

  // The item an expense counts towards, as the server pages them.
  const itemKey = useCallback((expense: Expense) => pageItemKey(expense, groupTrips), [groupTrips]);

  // Continues after the last item loaded (a cursor, not a position), so
  // deletes since the last page can't make it skip one.
  const loadMore = async () => {
    const generation = listGeneration.current;
    const isCurrent = () => generation === listGeneration.current;
    setLoadingMore(true);
    try {
      const params = buildQueryParams(nextCursor.current, PAGE_SIZE, false);
      if (groupTrips) params.set("groupTrips", "true");
      const data = await api.get(`/api/expenses?${params.toString()}`);
      // The filters or view changed meanwhile: this page isn't part of the list now.
      if (!isCurrent()) return;
      if (groupTrips && data.trips) setTrips((prev) => ({ ...prev, ...data.trips }));
      // A trip whose latest expense was deleted can sort after the cursor
      // and come again: keep only the expenses not listed yet.
      setExpenses((prev) => {
        const seen = new Set(prev.map((e) => e._id));
        return [...prev, ...data.expenses.filter((e: Expense) => !seen.has(e._id))];
      });
      nextCursor.current = data.pagination?.nextCursor ?? null;
      setHasMore(Boolean(data.pagination?.hasMore));
    } catch {
      if (isCurrent()) toast("Failed to load more expenses", "error");
    } finally {
      if (isCurrent()) setLoadingMore(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      // A request returns at most MAX_EXPENSE_PAGE rows: follow the cursor until the list ends.
      const exported: Expense[] = [];
      let cursor: string | null = null;
      for (let page = 0; ; page++) {
        if (page === MAX_EXPORT_PAGES) throw new Error("Export has too many pages");
        const params = buildQueryParams(cursor, MAX_EXPENSE_PAGE, false);
        // "All statuses" exports approved expenses (real spend); a picked Status exports that one.
        if (!filterApproval) params.set("approval", "approved");
        const data = await api.get(`/api/expenses?${params.toString()}`);
        exported.push(...(data.expenses as Expense[]));
        const next: string | null = data.pagination?.nextCursor ?? null;
        if (!data.pagination?.hasMore) break;
        // Never stop short silently, nor repeat a page forever.
        if (!next || next === cursor) throw new Error("Export cursor did not advance");
        cursor = next;
      }
      if (exported.length === 0 && !filterApproval) {
        toast("No approved expenses to export. Pick a Status to export the others.", "info");
        return;
      }
      const rows = exported.map(expenseCsvRow);
      const csv = buildCsv(EXPENSE_CSV_HEADERS, rows);
      const statusPart = filterApproval ? `-${filterApproval}` : "-approved";
      downloadCsv(`expenses${statusPart}-${format(new Date(), "yyyy-MM-dd")}.csv`, csv);
      toast(`Exported ${plural(rows.length, filterApproval ? "expense" : "approved expense")}`);
    } catch {
      toast("Failed to export expenses", "error");
    } finally {
      setExporting(false);
    }
  };

  // An expense being approved or rejected shows the status it's heading for during
  // the undo window, and the band moves with it; one that will leave the Status
  // filter is hidden meanwhile. Undo simply drops it from `inFlight`.
  const leavesFilter = useCallback(
    (expense: Expense) => Boolean(filterApproval) && effectiveApprovalStatus(expense) !== filterApproval,
    [filterApproval]
  );
  const displayExpenses = useMemo(
    () =>
      expenses.flatMap((e) => {
        const action = inFlight[e._id];
        if (!action) return [e];
        const reviewed = asReviewed(e, action);
        return leavesFilter(reviewed) ? [] : [reviewed];
      }),
    [expenses, inFlight, leavesFilter]
  );
  /** The pinned expense while it isn't on the loaded pages (once Load more brings it, the list has it). */
  const pinnedShown = useMemo(() => {
    if (!pinned || expenses.some((e) => e._id === pinned.expense._id)) return null;
    const action = inFlight[pinned.expense._id];
    return action ? asReviewed(pinned.expense, action) : pinned.expense;
  }, [pinned, expenses, inFlight]);
  const shownSummary = useMemo(() => {
    const listed = expenses.reduce((acc, e) => {
      const action = inFlight[e._id];
      if (!action) return acc;
      const reviewed = asReviewed(e, action);
      const without = shiftSummary(acc, e, -1, filterPayer, viewer);
      return leavesFilter(reviewed) ? without : shiftSummary(without, reviewed, 1, filterPayer, viewer);
    }, summary);
    // The pinned expense is in the summary only when no filter is on (so none to leave).
    if (pinned?.counted && pinnedShown && inFlight[pinned.expense._id]) {
      return shiftSummary(shiftSummary(listed, pinned.expense, -1, filterPayer, viewer), pinnedShown, 1, filterPayer, viewer);
    }
    return listed;
  }, [expenses, inFlight, leavesFilter, summary, filterPayer, viewer, pinned, pinnedShown]);

  const listItems = useMemo(
    () => buildExpenseListItems(displayExpenses, groupTrips ? trips : null),
    [displayExpenses, groupTrips, trips]
  );
  // Loaded items as the server counts them (an unopenable trip's rows are one).
  const allItemCount = useMemo(() => new Set(expenses.map(itemKey)).size, [expenses, itemKey]);
  const loadedItemCount = useMemo(() => new Set(displayExpenses.map(itemKey)).size, [displayExpenses, itemKey]);
  // Less the items hidden while a review that takes them out of the filter can be undone.
  const shownTotalCount = Math.max(0, totalCount - (allItemCount - loadedItemCount));

  // Moves an expense's amounts in or out of the totals band (delete / undo).
  const adjustTotals = (expense: Expense, sign: 1 | -1) => {
    setSummary((prev) => shiftSummary(prev, expense, sign, filterPayer, viewer));
  };

  // Optimistically remove the expense and give the user a short undo window
  // before the delete is committed to the server.
  const handleDelete = (shown: Expense) => {
    if ((shown.linkedAssetCount || 0) > 0) {
      toast("Linked asset purchases cannot be deleted from Expenses", "error");
      return;
    }
    // Delete is withdrawn while a review can be undone; this guards a stale click.
    if (inFlight[shown._id]) {
      toast(DELETE_WHILE_REVIEWING, "info");
      return;
    }
    const index = expenses.findIndex((e) => e._id === shown._id);
    if (index === -1) {
      if (pinned && pinned.expense._id === shown._id) deletePinned(pinned);
      return;
    }
    // The loaded version: a row in a review's undo window shows the status it's heading for.
    const expense = expenses[index];
    // The detail offers Delete only where it is allowed; this guards a stale click.
    if (user && !canDeleteExpense(user, expense)) {
      toast(APPROVED_DELETE_MESSAGE, "info");
      return;
    }

    // The item leaves the list (and the count) with its last listed expense:
    // deleting one expense of a trip cluster keeps the cluster.
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

    scheduleDelete(expense._id, {
      onUndo: restore,
      onFailed: (error) => {
        restore();
        deleteFailed(expense, error);
      },
    });

    toast(`Deleted "${expense.title}"`, "info", {
      durationMs: UNDO_WINDOW_MS,
      action: { label: "Undo", onClick: () => void undoDelete(expense._id) },
    });
  };

  /**
   * After a delete the server refused (the expense is back in the list and the
   * totals): its reason in words and, when it gave one (e.g. an admin approved
   * the expense meanwhile, so only the master admin may delete it now), the
   * expense re-read, so the row shows what the server has.
   */
  const deleteFailed = (expense: Expense, error: unknown) => {
    const refusal = deleteRefusal(error);
    toast(refusal ?? DELETE_FAILED, "error");
    // Once the restore has rendered: the re-read replaces the restored row.
    if (refusal) setToReread((prev) => [...prev, expense]);
  };

  /** Deletes the expense opened from a link (not on the loaded pages), with the same undo. */
  const deletePinned = (pin: PinnedExpense) => {
    const { expense } = pin;
    if (user && !canDeleteExpense(user, expense)) {
      toast(APPROVED_DELETE_MESSAGE, "info");
      return;
    }
    setPinned(null);
    if (pin.counted) adjustTotals(expense, -1);
    setSelectedId((prev) => (prev === expense._id ? null : prev));
    const restore = () => {
      setPinned(pin);
      if (pin.counted) adjustTotals(expense, 1);
    };
    scheduleDelete(expense._id, {
      onUndo: restore,
      onFailed: (error) => {
        restore();
        deleteFailed(expense, error);
      },
    });
    toast(`Deleted "${expense.title}"`, "info", {
      durationMs: UNDO_WINDOW_MS,
      action: { label: "Undo", onClick: () => void undoDelete(expense._id) },
    });
  };

  /** Delete for one expense: withdrawn while its approve/reject can still be undone. */
  const deleteFor = (expense: Expense) => (inFlight[expense._id] ? undefined : handleDelete);

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
  const selectedExpense = selectedId
    ? displayExpenses.find((e) => e._id === selectedId) ?? (pinnedShown?._id === selectedId ? pinnedShown : null)
    : null;

  if (loadingLookups || loadingExpenses) return <ExpenseListSkeleton />;

  const periodLabel =
    datePreset === CUSTOM_DATE_PRESET
      ? `${customFrom || "…"} → ${customTo || "…"}`
      : datePresetOptions.find((o) => o.value === datePreset)?.label ?? "All time";
  const userName = (id: string) => users.find((u) => u._id === id)?.name;
  const pendingCount = shownSummary.pendingCount ?? 0;
  const rejectedCount = shownSummary.rejectedCount ?? 0;
  const payerLabel = userName(filterPayer) ?? "this person";

  // The expense a link opened, when it isn't on the loaded pages: above the list, open.
  const pinnedBlock = pinnedShown && (
    <div className="border-b border-rule" data-testid="pinned-expense">
      <p className={cn("cap border-b border-rule-2 bg-sunk py-1.5 text-ink-3", panelPadX)}>
        {pinned?.counted ? "The expense you opened · further down the list" : "The expense you opened"}
      </p>
      <ExpenseRow
        expense={pinnedShown}
        selected={selectedId === pinnedShown._id}
        onSelect={() => toggleSelected(pinnedShown)}
        inlineDetail={!sidePanel}
        detailId={DETAIL_PANEL_ID}
        editHref={expenseEditHref(pinnedShown._id)}
        onDelete={deleteFor(pinnedShown)}
        review={review.handlers}
        canModify={canModify}
        showTripLink
      />
    </div>
  );

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
              title={
                filterApproval
                  ? `Download the filtered ${APPROVAL_LABEL[filterApproval].toLowerCase()} expenses as CSV`
                  : "Download the filtered approved expenses as CSV. Pick a Status to export the others."
              }
            >
              {filterApproval ? "Export CSV" : "Export approved (CSV)"}
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
          <Field label="Status" icon={ClipboardCheck} className="flex-[1_1_150px]">
            <select
              value={filterApproval}
              onChange={(e) => setFilterApproval(parseApprovalFilter(e.target.value) ?? "")}
              className={selectClass}
              title="Approval status. Only approved expenses count in the totals."
            >
              {APPROVAL_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </Field>
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
            {filterApproval && (
              <RemovableChip onRemove={() => setFilterApproval("")}>Status: {APPROVAL_LABEL[filterApproval]}</RemovableChip>
            )}
          </div>
        )}
      </div>

      <StatBand>
        <Stat
          headline
          label={`${periodLabel} total`}
          value={formatBaseCurrency(shownSummary.totalAmount)}
          sub={
            filterApproval === "pending" || filterApproval === "rejected"
              ? `${plural(shownSummary.totalExpenses, "approved expense")} · ${
                  filterApproval === "pending" ? "expenses awaiting approval" : "rejected expenses"
                } aren't in totals`
              : `${plural(shownSummary.totalExpenses, "approved expense")}${isAdmin ? "" : " · your share"}`
          }
          action={
            !isAdmin && rejectedCount > 0 && filterApproval !== "rejected" ? (
              <button
                type="button"
                onClick={() => setFilterApproval("rejected")}
                className={cn(
                  "inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-control text-[13px] font-medium text-danger hover:text-ink",
                  transition,
                  focusRing
                )}
              >
                <CircleX aria-hidden="true" size={14} strokeWidth={1.75} />
                {rejectedCount} rejected — see why
              </button>
            ) : undefined
          }
        />
        {pendingCount > 0 && (
          <Stat
            label={APPROVAL_LABEL.pending}
            icon={Clock3}
            value={formatBaseCurrency(shownSummary.pendingAmount ?? 0)}
            sub={`${plural(pendingCount, "expense")} · not in total`}
            action={
              isAdmin ? (
                <Link href={APPROVALS_HREF} aria-label="Review expenses awaiting approval" className={textButtonClass}>
                  Review
                </Link>
              ) : filterApproval !== "pending" ? (
                <button
                  type="button"
                  onClick={() => setFilterApproval("pending")}
                  aria-label="Show them: expenses awaiting approval"
                  className={cn(textButtonClass, "cursor-pointer")}
                >
                  Show them
                </button>
              ) : undefined
            }
          />
        )}
        <BandCell label="Company · pocket">
          {shownSummary.companyAmount != null && shownSummary.pocketAmount != null ? (
            <SplitBar company={shownSummary.companyAmount} pocket={shownSummary.pocketAmount} />
          ) : (
            // The list failed to load: nothing to split.
            <span className="text-sm text-ink-3">
              <span aria-hidden="true">—</span>
              <span className="sr-only">Not available</span>
            </span>
          )}
        </BandCell>
        {filterPayer && shownSummary.payerSpend && (
          <Stat
            label={`Paid by ${payerLabel}`}
            icon={UserIcon}
            value={formatBaseCurrency(shownSummary.payerSpend.totalSpend)}
            sub={`${formatBaseCurrency(shownSummary.payerSpend.pocketSpend)} pocket · ${formatBaseCurrency(shownSummary.payerSpend.companySpend)} company`}
          />
        )}
      </StatBand>

      <div className={cn("flex items-start gap-5", sidePanel ? "flex-nowrap" : "flex-wrap")}>
        <section
          ref={ledgerRef}
          tabIndex={-1}
          aria-label="Expense ledger"
          className={cn(
            panelClass,
            LEDGER_CONTAINER,
            "min-w-0 overflow-hidden",
            // With the detail panel open, the ledger takes whatever width the
            // panel doesn't (`w-0` so the panel's explicit width wins).
            sidePanel ? "w-0 flex-1" : "grow-[999] basis-[520px]"
          )}
        >
          {listItems.length === 0 ? (
            <>
              {pinnedBlock}
              <EmptyState
                icon={<Receipt />}
                title={
                  refreshingExpenses
                    ? "Updating expenses..."
                    : filterApproval === "pending"
                      ? "Nothing awaiting approval"
                      : filterApproval === "rejected"
                        ? "No rejected expenses"
                        : "No expenses found"
                }
                description={isFiltered ? "Try adjusting your filters." : "Create your first expense to get started."}
                action={
                  !isFiltered ? (
                    <Button icon={Plus} href="/dashboard/expenses/new">
                      Add expense
                    </Button>
                  ) : undefined
                }
              />
            </>
          ) : (
            <>
              <LedgerHead />
              {pinnedBlock}
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
                        review={review.handlers}
                        canModify={canModify}
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
                        onDelete={deleteFor(item.expense)}
                        review={review.handlers}
                        canModify={canModify}
                        showTripLink={!groupTrips}
                      />
                    )}
                  </li>
                ))}
              </ul>
              <div className={cn("flex flex-wrap items-center justify-between gap-3 border-t border-rule py-2.5 text-[13px] text-ink-3", panelPadX)}>
                <span>
                  {`Showing ${loadedItemCount} of ${shownTotalCount} ${groupTrips ? "item" : "expense"}${shownTotalCount !== 1 ? "s" : ""}${groupTrips ? " · each trip counts as one" : ""}`}
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
          <ExpenseDetailPanel id={DETAIL_PANEL_ID}>
            {selectedExpense ? (
              <ExpenseDetail
                key={selectedExpense._id}
                expense={selectedExpense}
                editHref={expenseEditHref(selectedExpense._id)}
                onDelete={deleteFor(selectedExpense)}
                review={review.handlers}
                canModify={canModify}
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
          </ExpenseDetailPanel>
        )}
      </div>
      {review.dialogs}
    </div>
  );
}
