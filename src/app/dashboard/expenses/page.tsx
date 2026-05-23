"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useTitle } from "@/hooks/useTitle";
import { useToast } from "@/components/ui/Toast";
import { InlineLoader, PageLoader } from "@/components/ui/Spinner";
import Spinner from "@/components/ui/Spinner";
import EmptyState from "@/components/ui/EmptyState";
import Modal from "@/components/ui/Modal";
import {
  Plus, Receipt, Trash2, Pencil, Paperclip, Download,
  Search, Filter, ChevronDown, FileText, Image as ImageIcon,
  Calendar, TrendingUp, User as UserIcon, Tag,
} from "lucide-react";
import { format, endOfMonth } from "date-fns";
import { formatCurrency, formatBaseCurrency } from "@/lib/currency";

interface Expense {
  _id: string;
  title: string;
  amount: number;
  amountInBaseCurrency?: number;
  currency?: { _id: string; code: string; name: string; symbol: string; isBase: boolean };
  date: string;
  description: string;
  receiptKey?: string;
  receiptFilename?: string;
  category: { _id: string; name: string };
  department: { _id: string; name: string };
  createdBy: { _id: string; name: string; email: string };
}

interface Department { _id: string; name: string }
interface Category { _id: string; name: string }
interface UserOption { _id: string; name: string; email: string }
interface ExpenseSummary {
  totalAmount: number;
  totalExpenses: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  "Office Supplies": "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30",
  "Travel": "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/30",
  "Meals & Entertainment": "bg-pink-100 text-pink-700 border-pink-200 dark:bg-pink-500/15 dark:text-pink-300 dark:border-pink-500/30",
  "Software & Subscriptions": "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30",
  "Equipment & Hardware": "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-500/15 dark:text-slate-300 dark:border-slate-500/30",
  "Marketing & Advertising": "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
  "Professional Services": "bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-500/15 dark:text-cyan-300 dark:border-cyan-500/30",
  "Utilities": "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-500/15 dark:text-yellow-300 dark:border-yellow-500/30",
  "Rent & Facilities": "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30",
  "Training & Education": "bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30",
  "Communication": "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30",
  "Insurance": "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
  "Miscellaneous": "bg-subtle text-muted border-line",
};

function getCategoryColor(name: string): string {
  return CATEGORY_COLORS[name] || "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30";
}

function isImageFile(filename?: string): boolean {
  if (!filename) return false;
  return /\.(jpg|jpeg|png|webp)$/i.test(filename);
}

function getMonthOptions(): { value: string; label: string }[] {
  const options = [{ value: "", label: "All Time" }];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    options.push({
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: format(d, "MMMM yyyy"),
    });
  }
  return options;
}

export default function ExpensesPage() {
  useTitle("Expenses");
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [receiptUrls, setReceiptUrls] = useState<Record<string, string>>({});
  const [loadingReceipt, setLoadingReceipt] = useState<string | null>(null);

  const [filterDept, setFilterDept] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  const [filterUser, setFilterUser] = useState("");
  const [urlSynced, setUrlSynced] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [summary, setSummary] = useState<ExpenseSummary>({ totalAmount: 0, totalExpenses: 0 });
  const [loadingLookups, setLoadingLookups] = useState(true);
  const [loadingExpenses, setLoadingExpenses] = useState(true);
  const [refreshingExpenses, setRefreshingExpenses] = useState(false);
  const hasLoadedExpenses = useRef(false);

  const monthOptions = useMemo(() => getMonthOptions(), []);

  useEffect(() => {
    if (typeof window === "undefined") {
      setUrlSynced(true);
      return;
    }
    const params = new URLSearchParams(window.location.search);
    setFilterDept(params.get("department") ?? "");
    setFilterCat(params.get("category") ?? "");
    setFilterUser(params.get("createdBy") ?? "");
    setUrlSynced(true);
  }, []);

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
        const params = new URLSearchParams({
          limit: "100",
          includeSummary: "true",
        });

        if (filterDept) params.set("department", filterDept);
        if (filterCat) params.set("category", filterCat);
        if (filterUser) params.set("createdBy", filterUser);
        if (search) params.set("search", search);

        if (filterMonth) {
          const [year, month] = filterMonth.split("-").map(Number);
          const monthStart = new Date(year, month - 1, 1);
          params.set("from", format(monthStart, "yyyy-MM-dd"));
          params.set("to", format(endOfMonth(monthStart), "yyyy-MM-dd"));
        }

        const data = await api.get(`/api/expenses?${params.toString()}`);
        if (!active) return;

        setExpenses(data.expenses);
        setSummary(data.summary || { totalAmount: 0, totalExpenses: 0 });
      } catch {
        if (active) {
          toast("Failed to load expenses", "error");
        }
      } finally {
        if (!active) return;

        if (initialLoad) {
          setLoadingExpenses(false);
          hasLoadedExpenses.current = true;
          setLoading(false);
        } else {
          setRefreshingExpenses(false);
        }
      }
    }

    loadExpenses();
    return () => {
      active = false;
    };
  }, [filterCat, filterDept, filterMonth, filterUser, search, toast, urlSynced]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/api/expenses/${deleteTarget._id}`);
      setExpenses((prev) => prev.filter((e) => e._id !== deleteTarget._id));
      toast("Expense deleted");
      setDeleteTarget(null);
      if (expandedId === deleteTarget._id) setExpandedId(null);
    } catch {
      toast("Failed to delete expense", "error");
    } finally {
      setDeleting(false);
    }
  };

  const toggleExpand = async (expense: Expense) => {
    if (expandedId === expense._id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(expense._id);
    if (expense.receiptKey && !receiptUrls[expense._id]) {
      setLoadingReceipt(expense._id);
      try {
        const { downloadUrl } = await api.get(`/api/upload?key=${encodeURIComponent(expense.receiptKey)}`);
        setReceiptUrls((prev) => ({ ...prev, [expense._id]: downloadUrl }));
      } catch {
        toast("Failed to load receipt", "error");
      } finally {
        setLoadingReceipt(null);
      }
    }
  };

  const handleDownload = (url: string) => { window.open(url, "_blank"); };

  if (loading || loadingLookups || loadingExpenses) return <PageLoader />;

  return (
    <div className="animate-fade-in space-y-6">
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

      {/* Summary bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100 px-4 py-3 dark:from-emerald-500/10 dark:to-teal-500/10 dark:border-emerald-500/30">
          <div className="rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 p-2 text-white">
            <TrendingUp className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              {filterMonth ? monthOptions.find((o) => o.value === filterMonth)?.label : "All Time"} Total
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
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search expenses..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="input-field pl-10"
            />
          </div>
          <div className={`grid gap-2 sm:grid-cols-2 ${isAdmin ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
            <div className="relative">
              <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-400" />
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <select
                value={filterMonth}
                onChange={(e) => setFilterMonth(e.target.value)}
                className="input-field w-full appearance-none pl-10 pr-9 text-sm"
                aria-label="Filter by month"
              >
                {monthOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="relative">
              <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-400" />
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <select
                value={filterDept}
                onChange={(e) => setFilterDept(e.target.value)}
                className="input-field w-full appearance-none pl-10 pr-9 text-sm"
                aria-label="Filter by department"
              >
                <option value="">All Departments</option>
                {departments.map((d) => (
                  <option key={d._id} value={d._id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div className="relative">
              <Tag className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-400" />
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <select
                value={filterCat}
                onChange={(e) => setFilterCat(e.target.value)}
                className="input-field w-full appearance-none pl-10 pr-9 text-sm"
                aria-label="Filter by category"
              >
                <option value="">All Categories</option>
                {categories.map((c) => (
                  <option key={c._id} value={c._id}>{c.name}</option>
                ))}
              </select>
            </div>
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
          </div>
        </div>
        {/* Active filter pills */}
        {(filterMonth || filterDept || filterCat || filterUser) && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <span className="text-xs text-muted-foreground">Filters:</span>
            {filterMonth && (
              <button
                onClick={() => setFilterMonth("")}
                className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-100 dark:bg-violet-500/10 dark:text-violet-300 dark:hover:bg-violet-500/20"
              >
                {monthOptions.find((o) => o.value === filterMonth)?.label} &times;
              </button>
            )}
            {filterDept && (
              <button
                onClick={() => setFilterDept("")}
                className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-blue-500/20"
              >
                {departments.find((d) => d._id === filterDept)?.name} &times;
              </button>
            )}
            {filterCat && (
              <button
                onClick={() => setFilterCat("")}
                className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20"
              >
                {categories.find((c) => c._id === filterCat)?.name} &times;
              </button>
            )}
            {filterUser && (
              <button
                onClick={() => setFilterUser("")}
                className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
              >
                {users.find((u) => u._id === filterUser)?.name} &times;
              </button>
            )}
          </div>
        )}
      </div>

      {expenses.length === 0 ? (
        <EmptyState
          icon={<Receipt className="h-8 w-8" />}
          title={refreshingExpenses ? "Updating expenses..." : "No expenses found"}
          description={search || filterDept || filterCat || filterMonth || filterUser ? "Try adjusting your filters." : "Create your first expense to get started."}
          action={
            !search && !filterDept && !filterCat && !filterMonth && !filterUser ? (
              <Link href="/dashboard/expenses/new" className="btn-primary">
                <Plus className="h-4 w-4" />
                Add Expense
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-2.5">
          {expenses.map((expense) => {
            const isExpanded = expandedId === expense._id;
            const receiptUrl = receiptUrls[expense._id];
            const isImage = isImageFile(expense.receiptFilename);
            const catColor = getCategoryColor(expense.category?.name);

            return (
              <div
                key={expense._id}
                className={`overflow-hidden rounded-xl border bg-surface shadow-sm transition-all duration-200 ${
                  isExpanded ? "border-brand-200 shadow-md shadow-brand-500/5" : "border-line hover:border-line-strong hover:shadow-md"
                }`}
              >
                {/* Summary row */}
                <button
                  onClick={() => toggleExpand(expense)}
                  className="flex w-full cursor-pointer items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-subtle/50"
                  aria-expanded={isExpanded}
                >
                  {/* Amount with colored left accent */}
                  <div className="w-28 flex-shrink-0 tabular-nums">
                    <p className="text-sm font-bold text-foreground">
                      {formatCurrency(expense.amount, expense.currency?.code)}
                    </p>
                    {expense.currency && !expense.currency.isBase && expense.amountInBaseCurrency != null && (
                      <p className="text-[11px] text-muted-foreground">{formatBaseCurrency(expense.amountInBaseCurrency)}</p>
                    )}
                  </div>

                  {/* Title & meta */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-foreground">{expense.title}</p>
                      {expense.receiptKey && (
                        <Paperclip className="h-3.5 w-3.5 flex-shrink-0 text-blue-400 dark:text-blue-300" />
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold ${catColor}`}>
                        {expense.category?.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {expense.department?.name}
                      </span>
                      <span className="text-xs text-muted-foreground">&middot;</span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(expense.date), "MMM d, yyyy")}
                      </span>
                      <span className="hidden text-xs text-muted-foreground sm:inline">&middot;</span>
                      <span className="hidden text-xs text-muted-foreground sm:inline">{expense.createdBy?.name}</span>
                    </div>
                  </div>

                  <ChevronDown
                    className={`h-5 w-5 flex-shrink-0 text-muted-foreground transition-transform duration-200 ${
                      isExpanded ? "rotate-180 text-brand-500" : ""
                    }`}
                  />
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="animate-slide-up border-t border-line">
                    <div className="bg-gradient-to-b from-subtle/80 to-surface px-5 py-5">
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="rounded-lg bg-surface p-3 shadow-sm border border-line">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Amount</p>
                          <p className="mt-1 text-base font-bold tabular-nums text-foreground">
                            {formatCurrency(expense.amount, expense.currency?.code)}
                          </p>
                          {expense.currency && !expense.currency.isBase && expense.amountInBaseCurrency != null && (
                            <p className="text-xs text-emerald-600 font-medium dark:text-emerald-400">
                              {formatBaseCurrency(expense.amountInBaseCurrency)}
                            </p>
                          )}
                        </div>
                        <div className="rounded-lg bg-surface p-3 shadow-sm border border-line">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Category</p>
                          <span className={`mt-1.5 inline-flex rounded-md border px-2.5 py-0.5 text-xs font-semibold ${catColor}`}>
                            {expense.category?.name}
                          </span>
                        </div>
                        <div className="rounded-lg bg-surface p-3 shadow-sm border border-line">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Department</p>
                          <p className="mt-1 text-sm font-medium text-foreground">{expense.department?.name}</p>
                        </div>
                        <div className="rounded-lg bg-surface p-3 shadow-sm border border-line">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Submitted by</p>
                          <p className="mt-1 text-sm font-medium text-foreground">{expense.createdBy?.name}</p>
                          <p className="text-xs text-muted-foreground">{format(new Date(expense.date), "MMMM d, yyyy")}</p>
                        </div>
                      </div>

                      {expense.description && (
                        <div className="mt-4 rounded-lg bg-surface p-3 shadow-sm border border-line">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Description</p>
                          <p className="mt-1 text-sm text-muted">{expense.description}</p>
                        </div>
                      )}

                      {/* Receipt preview */}
                      {expense.receiptKey && (
                        <div className="mt-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="rounded-md bg-blue-50 p-1 dark:bg-blue-500/10">
                                {isImage ? <ImageIcon className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" /> : <FileText className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />}
                              </div>
                              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Receipt</p>
                              {expense.receiptFilename && (
                                <span className="text-xs text-muted-foreground">{expense.receiptFilename}</span>
                              )}
                            </div>
                            {receiptUrl && (
                              <button onClick={() => handleDownload(receiptUrl)} className="btn-ghost py-1 text-xs">
                                <Download className="h-3.5 w-3.5" /> Download
                              </button>
                            )}
                          </div>

                          <div className="mt-2 overflow-hidden rounded-lg border border-line bg-surface shadow-sm">
                            {loadingReceipt === expense._id ? (
                              <div className="flex items-center justify-center py-16">
                                <Spinner size="md" />
                              </div>
                            ) : receiptUrl ? (
                              isImage ? (
                                <img src={receiptUrl} alt={`Receipt for ${expense.title}`} className="max-h-[500px] w-full object-contain" />
                              ) : (
                                <iframe src={receiptUrl} title={`Receipt for ${expense.title}`} className="h-[500px] w-full" />
                              )
                            ) : (
                              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                <FileText className="mb-2 h-8 w-8" />
                                <p className="text-sm">Could not load receipt preview</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="mt-5 flex items-center gap-2 border-t border-line pt-4">
                        <Link href={`/dashboard/expenses/${expense._id}/edit`} className="btn-secondary text-sm">
                          <Pencil className="h-4 w-4" /> Edit
                        </Link>
                        <button
                          onClick={() => setDeleteTarget(expense)}
                          className="btn-ghost text-sm text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-500/10 dark:hover:text-red-300"
                        >
                          <Trash2 className="h-4 w-4" /> Delete
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Delete modal */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Expense">
        <p className="text-sm text-muted">
          Are you sure you want to delete <span className="font-medium">&ldquo;{deleteTarget?.title}&rdquo;</span>? This action cannot be undone.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={() => setDeleteTarget(null)} className="btn-secondary" disabled={deleting}>
            Cancel
          </button>
          <button onClick={handleDelete} className="btn-danger" disabled={deleting}>
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
