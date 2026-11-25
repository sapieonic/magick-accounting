"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Keyboard,
  ListChecks,
  MousePointerClick,
  RotateCcw,
  SearchX,
  User as UserIcon,
  X,
} from "lucide-react";
import { formatDistanceStrict } from "date-fns";
import { api } from "@/lib/api";
import { effectiveApprovalStatus } from "@/lib/approval";
import { formatBaseCurrency, formatCurrency } from "@/lib/currency";
import { useAuth } from "@/contexts/AuthContext";
import { useApprovalCount } from "@/contexts/ApprovalCountContext";
import { useTitle } from "@/hooks/useTitle";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useApprovalActions } from "@/hooks/useApprovalActions";
import { useToast } from "@/components/ui/Toast";
import PageHeader from "@/components/ui/PageHeader";
import Button, { IconButton } from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import Field, { selectClass } from "@/components/ui/Field";
import SearchInput from "@/components/ui/SearchInput";
import { InlineLoader } from "@/components/ui/Spinner";
import { ExpenseListSkeleton } from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/cn";
import { panelClass, panelPadX } from "@/components/ui/styles";
import ExpenseDetail from "@/components/expenses/ledger/ExpenseDetail";
import ExpenseDetailPanel from "@/components/expenses/ledger/ExpenseDetailPanel";
import ExpenseRow, { LEDGER_CONTAINER, LedgerHead, SelectAllCheckbox } from "@/components/expenses/ledger/ExpenseRow";
import { baseAmount, expenseEditHref } from "@/components/expenses/ledger/format";
import ApproveDialog from "@/components/approvals/ApproveDialog";
import BulkBar from "@/components/approvals/BulkBar";
import ShortcutsDialog from "@/components/approvals/ShortcutsDialog";
import type { ExpenseListItem } from "@/types/expense";

type Expense = ExpenseListItem;

interface UserOption {
  _id: string;
  name: string;
  email: string;
}

const PAGE_SIZE = 50;
const QUEUE_PATH = "/dashboard/approvals";
/** Wide enough for the ledger plus the detail side panel (as on Expenses). */
const SIDE_PANEL_QUERY = "(min-width: 1280px)";
/** From here up the row checkboxes always show; below, "Select" turns them on. */
const DESKTOP_QUERY = "(min-width: 1024px)";
const DETAIL_PANEL_ID = "approval-detail-panel";

const isPending = (expense: Expense) => effectiveApprovalStatus(expense) === "pending";

/** Typing in a field, or a dialog / the palette is open: the shortcuts stand down. */
function shortcutsPaused(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return true;
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (
    target?.closest(
      "textarea, select, [contenteditable=''], [contenteditable='true'], [role='combobox'], input:not([type='checkbox']):not([type='radio'])"
    )
  ) {
    return true;
  }
  return Boolean(document.querySelector("[aria-modal='true']"));
}

/** "6 days" since the oldest submission. */
function oldestAge(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return formatDistanceStrict(date, new Date());
}

export default function ApprovalsPage() {
  useTitle("Approvals");
  const router = useRouter();
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const queue = useApprovalCount();
  const sidePanel = useMediaQuery(SIDE_PANEL_QUERY);
  const desktop = useMediaQuery(DESKTOP_QUERY);

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  /** Pending expenses matching the filters, as the server first counted them (less removals since). */
  const [total, setTotal] = useState(0);
  /** Their base-currency total, from the list's summary. */
  const [pendingAmount, setPendingAmount] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [filterUser, setFilterUser] = useState("");

  /** The open expense (detail in the side panel, or under its row). */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Ticked rows, for approving or rejecting several at once. */
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  /** Phones and tablets: "Select" shows the checkboxes. */
  const [selectMode, setSelectMode] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState<Expense[] | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const nextCursor = useRef<string | null>(null);
  /** Bumped per reload: a Load more begun for an earlier list is dropped. */
  const listGeneration = useRef(0);
  const hasLoaded = useRef(false);
  const ledgerRef = useRef<HTMLElement>(null);
  const emptyHeadingRef = useRef<HTMLHeadingElement>(null);
  /** A row (by id) or the empty state to focus after the next render. */
  const pendingFocus = useRef<string | null>(null);
  const visibleRef = useRef<Expense[]>([]);
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selectedId;

  const review = useApprovalActions({
    shortcuts: true,
    onUpdated: (expense) => setExpenses((prev) => prev.map((e) => (e._id === expense._id ? expense : e))),
    onRemoved: (id) => {
      setExpenses((prev) => prev.filter((e) => e._id !== id));
      setTotal((prev) => Math.max(0, prev - 1));
    },
    // The reviewed expenses leave the queue now: open the next one and keep the keyboard there.
    onScheduled: (reviewed) => {
      const ids = new Set(reviewed.map((e) => e._id));
      const list = visibleRef.current;
      const remaining = list.filter((e) => !ids.has(e._id));
      const current = selectedRef.current;
      if (current && ids.has(current)) {
        const index = list.findIndex((e) => e._id === current);
        const next =
          list.slice(index + 1).find((e) => !ids.has(e._id)) ??
          list.slice(0, Math.max(0, index)).reverse().find((e) => !ids.has(e._id)) ??
          null;
        setSelectedId(next?._id ?? null);
        pendingFocus.current = next?._id ?? "empty";
      } else {
        const stillOpen = current && remaining.some((e) => e._id === current) ? current : null;
        pendingFocus.current = stillOpen ?? remaining[0]?._id ?? "empty";
      }
    },
  });
  const { flush: flushReviews, inFlight } = review;

  // Same guard as the other admin pages.
  useEffect(() => {
    if (!isAdmin) router.replace("/dashboard");
  }, [isAdmin, router]);

  useEffect(() => {
    const id = window.setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    api
      .get("/api/users")
      .then((data) => {
        if (active) setUsers(data?.users ?? []);
      })
      .catch(() => {
        // Non-critical: the "Submitted by" filter just stays empty.
      });
    return () => {
      active = false;
    };
  }, [isAdmin]);

  const buildParams = useCallback(
    (cursor: string | null) => {
      const params = new URLSearchParams({ approval: "pending", limit: String(PAGE_SIZE) });
      if (search) params.set("search", search);
      if (filterUser) params.set("createdBy", filterUser);
      if (cursor) params.set("cursor", cursor);
      else params.set("includeSummary", "true");
      return params;
    },
    [search, filterUser]
  );

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    const initial = !hasLoaded.current;
    listGeneration.current += 1;
    setLoadingMore(false);
    if (initial) setLoading(true);
    else setRefreshing(true);

    (async () => {
      try {
        // Send reviews still in their undo window first, so the list matches the server.
        await flushReviews();
        const data = await api.get(`/api/expenses?${buildParams(null).toString()}`);
        if (!active) return;
        const loaded: Expense[] = data?.expenses ?? [];
        setExpenses(loaded);
        setTotal(data?.pagination?.total ?? loaded.length);
        setHasMore(Boolean(data?.pagination?.hasMore));
        nextCursor.current = data?.pagination?.nextCursor ?? null;
        const amount = data?.summary?.pendingAmount;
        setPendingAmount(typeof amount === "number" ? amount : null);
        setLoadError(false);
        setChecked(new Set());
        setSelectedId((prev) => (prev && loaded.some((e) => e._id === prev) ? prev : null));
      } catch {
        if (!active) return;
        setLoadError(true);
        toast("Failed to load the approval queue", "error");
      } finally {
        if (active) {
          listGeneration.current += 1;
          hasLoaded.current = true;
          setLoading(false);
          setRefreshing(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [isAdmin, buildParams, flushReviews, reloadToken, toast]);

  const loadMore = useCallback(async () => {
    const generation = listGeneration.current;
    const isCurrent = () => generation === listGeneration.current;
    setLoadingMore(true);
    try {
      const data = await api.get(`/api/expenses?${buildParams(nextCursor.current).toString()}`);
      if (!isCurrent()) return;
      setExpenses((prev) => {
        const seen = new Set(prev.map((e) => e._id));
        return [...prev, ...(data?.expenses ?? []).filter((e: Expense) => !seen.has(e._id))];
      });
      nextCursor.current = data?.pagination?.nextCursor ?? null;
      setHasMore(Boolean(data?.pagination?.hasMore));
    } catch {
      if (isCurrent()) toast("Failed to load more expenses", "error");
    } finally {
      if (isCurrent()) setLoadingMore(false);
    }
  }, [buildParams, toast]);

  /** Still waiting, and not being approved or rejected right now. */
  const visible = useMemo(() => expenses.filter((e) => isPending(e) && !inFlight[e._id]), [expenses, inFlight]);
  visibleRef.current = visible;

  // Loaded expenses that have left the queue (reviewed, or in their undo window).
  const left = expenses.length - visible.length;
  const leftAmount = useMemo(
    () => expenses.filter((e) => !isPending(e) || inFlight[e._id]).reduce((sum, e) => sum + baseAmount(e), 0),
    [expenses, inFlight]
  );
  const remaining = Math.max(0, total - left);
  const remainingAmount =
    pendingAmount != null ? Math.max(0, pendingAmount - leftAmount) : visible.reduce((sum, e) => sum + baseAmount(e), 0);

  const checkedVisible = useMemo(() => visible.filter((e) => checked.has(e._id)), [visible, checked]);
  const checkedAmount = checkedVisible.reduce((sum, e) => sum + baseAmount(e), 0);
  const showCheckboxes = desktop || selectMode;
  const selected = selectedId ? visible.find((e) => e._id === selectedId) ?? null : null;
  const selectedIndex = selected ? visible.indexOf(selected) : -1;
  const isFiltered = Boolean(search || filterUser);

  // A page cleared entirely while more wait on the server: fetch them.
  useEffect(() => {
    if (!loading && !loadingMore && hasMore && visible.length === 0 && Object.keys(inFlight).length === 0) {
      void loadMore();
    }
  }, [loading, loadingMore, hasMore, visible.length, inFlight, loadMore]);

  // The opened expense was reviewed elsewhere or filtered out: close it.
  useEffect(() => {
    if (selectedId && !loading && !visible.some((e) => e._id === selectedId) && !inFlight[selectedId]) {
      setSelectedId(null);
    }
  }, [selectedId, visible, inFlight, loading]);

  // Moves focus where the last action left it (the next row, or the empty state).
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    if (target === "empty") {
      emptyHeadingRef.current?.focus();
      return;
    }
    ledgerRef.current
      ?.querySelector<HTMLElement>(`[data-expense-row="${CSS.escape(target)}"] [data-row-title]`)
      ?.focus();
  });

  const open = useCallback((expense: Expense | null, focus = false) => {
    setSelectedId(expense?._id ?? null);
    if (focus && expense) pendingFocus.current = expense._id;
  }, []);

  const toggleChecked = useCallback((id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = () => {
    setChecked(checkedVisible.length === visible.length ? new Set() : new Set(visible.map((e) => e._id)));
  };

  const move = useCallback(
    (step: 1 | -1) => {
      const list = visibleRef.current;
      if (list.length === 0) return;
      const index = list.findIndex((e) => e._id === selectedRef.current);
      const nextIndex = index === -1 ? (step === 1 ? 0 : list.length - 1) : Math.min(list.length - 1, Math.max(0, index + step));
      open(list[nextIndex], true);
    },
    [open]
  );

  const approveChecked = () => {
    if (checkedVisible.length === 1) review.approve(checkedVisible);
    else setConfirmBulk(checkedVisible);
  };

  const clearFilters = () => {
    setSearchInput("");
    setSearch("");
    setFilterUser("");
  };

  const toggleSelectMode = () => {
    setSelectMode((prev) => {
      if (prev) setChecked(new Set());
      return !prev;
    });
  };

  // Keyboard: J/K or ↓/↑ move, X ticks, A approves, R rejects, Esc closes, ? lists them.
  const keyActions = useRef<(event: KeyboardEvent) => void>(() => {});
  keyActions.current = (event: KeyboardEvent) => {
    if (shortcutsPaused(event)) return;
    const current = selected;
    switch (event.key) {
      case "j":
      case "ArrowDown":
        event.preventDefault();
        move(1);
        break;
      case "k":
      case "ArrowUp":
        event.preventDefault();
        move(-1);
        break;
      case "x":
        if (!current) return;
        event.preventDefault();
        if (!showCheckboxes) setSelectMode(true);
        toggleChecked(current._id);
        break;
      case "a":
        if (!current) return;
        event.preventDefault();
        review.approve([current]);
        break;
      case "r":
        if (!current) return;
        event.preventDefault();
        review.openReject([current]);
        break;
      case "Escape":
        if (!current) return;
        event.preventDefault();
        pendingFocus.current = current._id;
        setSelectedId(null);
        break;
      case "?":
        event.preventDefault();
        setShowShortcuts(true);
        break;
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    const onKeyDown = (event: KeyboardEvent) => keyActions.current(event);
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isAdmin]);

  if (!isAdmin) return null;
  if (loading) return <ExpenseListSkeleton />;

  const age = isFiltered ? null : oldestAge(queue.oldestPendingAt);
  const meta = [
    isFiltered ? `${remaining} awaiting approval match these filters` : `${remaining} awaiting approval`,
    remaining > 0 && formatBaseCurrency(remainingAmount),
    remaining > 0 && age && `oldest ${age}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const queueRows = (
    <ul>
      {visible.map((expense) => (
        <li key={expense._id}>
          <ExpenseRow
            variant="review"
            expense={expense}
            selected={selectedId === expense._id}
            onSelect={() => open(selectedId === expense._id ? null : expense)}
            inlineDetail={!sidePanel}
            detailId={DETAIL_PANEL_ID}
            editHref={expenseEditHref(expense._id, QUEUE_PATH)}
            showTripLink
            review={review.handlers}
            selection={
              showCheckboxes
                ? {
                    checked: checked.has(expense._id),
                    onToggle: () => toggleChecked(expense._id),
                    label: `Select ${expense.title}, ${formatCurrency(expense.amount, expense.currency?.code)}`,
                    keyShortcut: "X",
                  }
                : undefined
            }
          />
        </li>
      ))}
    </ul>
  );

  let body;
  if (loadError && expenses.length === 0) {
    body = (
      <EmptyState
        icon={<AlertCircle />}
        title="Couldn't load the approval queue"
        description="Check your connection and try again. Nothing was approved or rejected."
        action={
          <Button variant="secondary" icon={RotateCcw} onClick={() => setReloadToken((n) => n + 1)}>
            Retry
          </Button>
        }
      />
    );
  } else if (visible.length === 0) {
    body = isFiltered ? (
      <EmptyState
        headingRef={emptyHeadingRef}
        icon={<SearchX />}
        title="No pending expenses match these filters"
        description="Try another search or person, or clear the filters to see the whole queue."
        action={
          <Button variant="secondary" onClick={clearFilters}>
            Clear filters
          </Button>
        }
      />
    ) : hasMore || loadingMore ? (
      <div className="py-14">
        <InlineLoader label="Loading the next expenses..." />
      </div>
    ) : (
      <EmptyState
        headingRef={emptyHeadingRef}
        icon={<CheckCheck />}
        title="You're all caught up"
        description="No expenses are waiting for approval. New submissions from your team will appear here."
        action={
          <Button variant="secondary" href="/dashboard/expenses">
            View all expenses
          </Button>
        }
      />
    );
  } else {
    body = (
      <>
        <LedgerHead
          select={
            showCheckboxes ? (
              <SelectAllCheckbox selected={checkedVisible.length} total={visible.length} onToggle={toggleAll} />
            ) : undefined
          }
        />
        {queueRows}
        <div className={cn("flex flex-wrap items-center justify-between gap-3 border-t border-rule py-2.5 text-[13px] text-ink-3", panelPadX)}>
          <span>{`Showing ${visible.length} of ${remaining} awaiting approval`}</span>
          {hasMore && (
            <Button variant="secondary" icon={ChevronDown} loading={loadingMore} onClick={loadMore}>
              {loadingMore ? "Loading..." : "Load more"}
            </Button>
          )}
        </div>
      </>
    );
  }

  const selectedName = (expense: Expense) => `"${expense.title}" · ${formatCurrency(expense.amount, expense.currency?.code)}`;

  return (
    <div className="animate-fade-in flex flex-col gap-6">
      <PageHeader
        title="Approvals"
        meta={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            {meta}
            {refreshing && <InlineLoader label="Refreshing..." />}
          </span>
        }
        actions={
          <>
            <Button
              variant="ghost"
              icon={Keyboard}
              onClick={() => setShowShortcuts(true)}
              aria-keyshortcuts="Shift+?"
              className="hidden lg:inline-flex"
            >
              Keyboard shortcuts
            </Button>
            {!desktop && visible.length > 0 && (
              <Button variant="secondary" icon={ListChecks} aria-pressed={selectMode} onClick={toggleSelectMode}>
                {selectMode ? "Done" : "Select"}
              </Button>
            )}
          </>
        }
      />

      <form aria-label="Filters" onSubmit={(e) => e.preventDefault()} className="flex flex-wrap items-end gap-3">
        <Field label="Search" className="flex-[3_1_240px]">
          <SearchInput value={searchInput} onValueChange={setSearchInput} placeholder="Title, vendor, note" />
        </Field>
        <Field label="Submitted by" icon={UserIcon} className="flex-[1_1_180px]">
          <select value={filterUser} onChange={(e) => setFilterUser(e.target.value)} className={selectClass}>
            <option value="">Anyone</option>
            {users.map((u) => (
              <option key={u._id} value={u._id}>
                {u.name}
              </option>
            ))}
          </select>
        </Field>
        {isFiltered && (
          <Button variant="ghost" icon={X} onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </form>

      <div className={cn("flex items-start gap-5", sidePanel ? "flex-nowrap" : "flex-wrap")}>
        <section
          ref={ledgerRef}
          aria-label="Approval queue"
          className={cn(
            panelClass,
            LEDGER_CONTAINER,
            "min-w-0 overflow-hidden",
            sidePanel ? "w-0 flex-1" : "grow-[999] basis-[520px]"
          )}
        >
          {body}
        </section>

        {sidePanel && (
          <ExpenseDetailPanel id={DETAIL_PANEL_ID}>
            {selected ? (
              <>
                <div className={cn("flex items-center justify-between gap-2 border-b border-rule py-1.5", panelPadX)}>
                  <span className="num text-[13px] text-ink-3">
                    {selectedIndex + 1} of {visible.length}
                    {hasMore ? "+" : ""}
                  </span>
                  <span className="flex items-center gap-1">
                    <IconButton
                      icon={ChevronUp}
                      size="sm"
                      onClick={() => move(-1)}
                      disabled={selectedIndex <= 0}
                      aria-label="Previous expense"
                      aria-keyshortcuts="K ArrowUp"
                    />
                    <IconButton
                      icon={ChevronDown}
                      size="sm"
                      onClick={() => move(1)}
                      disabled={selectedIndex >= visible.length - 1}
                      aria-label="Next expense"
                      aria-keyshortcuts="J ArrowDown"
                    />
                  </span>
                </div>
                <ExpenseDetail
                  key={selected._id}
                  expense={selected}
                  editHref={expenseEditHref(selected._id, QUEUE_PATH)}
                  review={review.handlers}
                  onClose={() => open(null)}
                  showHeader
                  className="bg-wash-r p-5"
                />
              </>
            ) : (
              <EmptyState
                icon={<MousePointerClick />}
                title="No expense selected"
                description={
                  visible.length > 0
                    ? "Pick one to see its receipt and approve or reject it. Or press J to start from the top."
                    : "Nothing to review right now."
                }
              />
            )}
          </ExpenseDetailPanel>
        )}
      </div>

      {checkedVisible.length > 0 ? (
        <BulkBar
          summary={
            <>
              {checkedVisible.length} selected · <span className="num">{formatBaseCurrency(checkedAmount)}</span>
            </>
          }
        >
          <Button variant="ghost" onClick={() => setChecked(new Set())}>
            Clear
          </Button>
          <Button variant="danger" icon={X} onClick={() => review.openReject(checkedVisible)}>
            Reject…
          </Button>
          <Button icon={Check} onClick={approveChecked}>
            Approve {checkedVisible.length}
          </Button>
        </BulkBar>
      ) : (
        !sidePanel &&
        selected && (
          <BulkBar label="Selected expense" summary={selectedName(selected)}>
            <Button variant="danger" icon={X} onClick={() => review.openReject([selected])}>
              Reject…
            </Button>
            <Button icon={Check} onClick={() => review.approve([selected])}>
              Approve
            </Button>
          </BulkBar>
        )
      )}

      <ApproveDialog
        isOpen={confirmBulk !== null}
        expenses={confirmBulk ?? []}
        onClose={() => setConfirmBulk(null)}
        onConfirm={() => {
          const targets = confirmBulk ?? [];
          setConfirmBulk(null);
          review.approve(targets);
        }}
      />
      <ShortcutsDialog isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} />
      {review.dialogs}
    </div>
  );
}

