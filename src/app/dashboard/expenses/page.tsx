"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useTitle } from "@/hooks/useTitle";
import { useToast } from "@/components/ui/Toast";
import { PageLoader } from "@/components/ui/Spinner";
import Spinner from "@/components/ui/Spinner";
import EmptyState from "@/components/ui/EmptyState";
import Modal from "@/components/ui/Modal";
import {
  Plus, Receipt, Trash2, Pencil, Paperclip, Download,
  Search, Filter, ChevronDown, FileText, Image as ImageIcon, X,
} from "lucide-react";
import { format } from "date-fns";
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

function isImageFile(filename?: string): boolean {
  if (!filename) return false;
  return /\.(jpg|jpeg|png|webp)$/i.test(filename);
}

export default function ExpensesPage() {
  useTitle("Expenses");
  const { toast } = useToast();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Expand / receipt state
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [receiptUrls, setReceiptUrls] = useState<Record<string, string>>({});
  const [loadingReceipt, setLoadingReceipt] = useState<string | null>(null);

  const [filterDept, setFilterDept] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [search, setSearch] = useState("");

  const loadData = useCallback(async () => {
    try {
      let url = "/api/expenses?limit=100";
      if (filterDept) url += `&department=${filterDept}`;
      if (filterCat) url += `&category=${filterCat}`;

      const [expData, deptData, catData] = await Promise.all([
        api.get(url),
        api.get("/api/departments"),
        api.get("/api/categories"),
      ]);

      setExpenses(expData.expenses);
      setDepartments(deptData.departments);
      setCategories(catData.categories);
    } catch {
      toast("Failed to load expenses", "error");
    } finally {
      setLoading(false);
    }
  }, [filterDept, filterCat, toast]);

  useEffect(() => { loadData(); }, [loadData]);

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

    // Load receipt URL if needed
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

  const handleDownload = (url: string) => {
    window.open(url, "_blank");
  };

  const filteredExpenses = expenses.filter((e) =>
    search ? e.title.toLowerCase().includes(search.toLowerCase()) : true
  );

  if (loading) return <PageLoader />;

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Expenses</h1>
          <p className="text-sm text-gray-500">Manage and track all expenses.</p>
        </div>
        <Link href="/dashboard/expenses/new" className="btn-primary">
          <Plus className="h-4 w-4" />
          Add Expense
        </Link>
      </div>

      {/* Filters */}
      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search expenses..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-10"
          />
        </div>
        <div className="flex gap-3">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <select
              value={filterDept}
              onChange={(e) => setFilterDept(e.target.value)}
              className="input-field appearance-none pl-10 pr-8"
              aria-label="Filter by department"
            >
              <option value="">All Departments</option>
              {departments.map((d) => (
                <option key={d._id} value={d._id}>{d.name}</option>
              ))}
            </select>
          </div>
          <select
            value={filterCat}
            onChange={(e) => setFilterCat(e.target.value)}
            className="input-field appearance-none"
            aria-label="Filter by category"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c._id} value={c._id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {filteredExpenses.length === 0 ? (
        <EmptyState
          icon={<Receipt className="h-8 w-8" />}
          title="No expenses found"
          description={search || filterDept || filterCat ? "Try adjusting your filters." : "Create your first expense to get started."}
          action={
            !search && !filterDept && !filterCat ? (
              <Link href="/dashboard/expenses/new" className="btn-primary">
                <Plus className="h-4 w-4" />
                Add Expense
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {filteredExpenses.map((expense) => {
            const isExpanded = expandedId === expense._id;
            const receiptUrl = receiptUrls[expense._id];
            const isImage = isImageFile(expense.receiptFilename);

            return (
              <div key={expense._id} className="card overflow-hidden transition-shadow hover:shadow-md">
                {/* Summary row — always visible, clickable to expand */}
                <button
                  onClick={() => toggleExpand(expense)}
                  className="flex w-full cursor-pointer items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-gray-50/50"
                  aria-expanded={isExpanded}
                >
                  {/* Amount */}
                  <div className="w-28 flex-shrink-0 tabular-nums">
                    <p className="text-sm font-semibold text-gray-900">
                      {formatCurrency(expense.amount, expense.currency?.code)}
                    </p>
                    {expense.currency && !expense.currency.isBase && expense.amountInBaseCurrency != null && (
                      <p className="text-xs text-gray-400">{formatBaseCurrency(expense.amountInBaseCurrency)}</p>
                    )}
                  </div>

                  {/* Title & meta */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-gray-900">{expense.title}</p>
                      {expense.receiptKey && (
                        <Paperclip className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-gray-500">
                      {expense.category?.name}
                      <span className="mx-1.5 text-gray-300">&middot;</span>
                      {expense.department?.name}
                      <span className="mx-1.5 text-gray-300">&middot;</span>
                      {format(new Date(expense.date), "MMM d, yyyy")}
                      <span className="mx-1.5 hidden text-gray-300 sm:inline">&middot;</span>
                      <span className="hidden sm:inline">{expense.createdBy?.name}</span>
                    </p>
                  </div>

                  {/* Chevron */}
                  <ChevronDown
                    className={`h-5 w-5 flex-shrink-0 text-gray-400 transition-transform duration-200 ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {/* Expanded detail panel */}
                {isExpanded && (
                  <div className="animate-slide-up border-t border-gray-100 bg-gray-50/30">
                    <div className="px-5 py-4">
                      {/* Detail grid */}
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Amount</p>
                          <p className="mt-1 text-sm font-semibold tabular-nums text-gray-900">
                            {formatCurrency(expense.amount, expense.currency?.code)}
                          </p>
                          {expense.currency && !expense.currency.isBase && expense.amountInBaseCurrency != null && (
                            <p className="text-xs text-gray-500">
                              {formatBaseCurrency(expense.amountInBaseCurrency)} (INR)
                            </p>
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Category</p>
                          <p className="mt-1 text-sm text-gray-900">{expense.category?.name}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Department</p>
                          <p className="mt-1 text-sm text-gray-900">{expense.department?.name}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Submitted by</p>
                          <p className="mt-1 text-sm text-gray-900">{expense.createdBy?.name}</p>
                          <p className="text-xs text-gray-500">{format(new Date(expense.date), "MMMM d, yyyy")}</p>
                        </div>
                      </div>

                      {/* Description */}
                      {expense.description && (
                        <div className="mt-4">
                          <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Description</p>
                          <p className="mt-1 text-sm text-gray-700">{expense.description}</p>
                        </div>
                      )}

                      {/* Receipt preview */}
                      {expense.receiptKey && (
                        <div className="mt-4">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Receipt</p>
                            {receiptUrl && (
                              <button
                                onClick={() => handleDownload(receiptUrl)}
                                className="btn-ghost py-1 text-xs"
                              >
                                <Download className="h-3.5 w-3.5" />
                                Download
                              </button>
                            )}
                          </div>

                          <div className="mt-2 overflow-hidden rounded-lg border border-gray-200 bg-white">
                            {loadingReceipt === expense._id ? (
                              <div className="flex items-center justify-center py-16">
                                <Spinner size="md" />
                              </div>
                            ) : receiptUrl ? (
                              isImage ? (
                                <img
                                  src={receiptUrl}
                                  alt={`Receipt for ${expense.title}`}
                                  className="max-h-[500px] w-full object-contain"
                                />
                              ) : (
                                <iframe
                                  src={receiptUrl}
                                  title={`Receipt for ${expense.title}`}
                                  className="h-[500px] w-full"
                                />
                              )
                            ) : (
                              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                                <FileText className="mb-2 h-8 w-8" />
                                <p className="text-sm">Could not load receipt preview</p>
                              </div>
                            )}
                          </div>

                          {expense.receiptFilename && (
                            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-gray-400">
                              {isImage ? <ImageIcon className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                              {expense.receiptFilename}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="mt-5 flex items-center gap-2 border-t border-gray-100 pt-4">
                        <Link href={`/dashboard/expenses/${expense._id}/edit`} className="btn-secondary text-sm">
                          <Pencil className="h-4 w-4" />
                          Edit
                        </Link>
                        <button
                          onClick={() => setDeleteTarget(expense)}
                          className="btn-ghost text-sm text-red-600 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
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

      {/* Delete confirmation modal */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Expense">
        <p className="text-sm text-gray-600">
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
