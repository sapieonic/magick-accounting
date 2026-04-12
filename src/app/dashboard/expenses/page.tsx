"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useTitle } from "@/hooks/useTitle";
import { useToast } from "@/components/ui/Toast";
import { PageLoader } from "@/components/ui/Spinner";
import EmptyState from "@/components/ui/EmptyState";
import Modal from "@/components/ui/Modal";
import { Plus, Receipt, Trash2, Pencil, Paperclip, Download, Search, Filter } from "lucide-react";
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

interface Department {
  _id: string;
  name: string;
}

interface Category {
  _id: string;
  name: string;
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

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/api/expenses/${deleteTarget._id}`);
      setExpenses((prev) => prev.filter((e) => e._id !== deleteTarget._id));
      toast("Expense deleted");
      setDeleteTarget(null);
    } catch {
      toast("Failed to delete expense", "error");
    } finally {
      setDeleting(false);
    }
  };

  const handleDownloadReceipt = async (key: string) => {
    try {
      const { downloadUrl } = await api.get(`/api/upload?key=${encodeURIComponent(key)}`);
      window.open(downloadUrl, "_blank");
    } catch {
      toast("Failed to get receipt", "error");
    }
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
        <div className="card overflow-hidden">
          {/* Desktop table */}
          <div className="hidden md:block">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Title</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Category</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Department</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">By</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredExpenses.map((expense) => (
                  <tr key={expense._id} className="transition-colors hover:bg-gray-50/50">
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-gray-900">{expense.title}</p>
                      {expense.description && (
                        <p className="mt-0.5 max-w-xs truncate text-xs text-gray-500">{expense.description}</p>
                      )}
                    </td>
                    <td className="px-6 py-4 tabular-nums">
                      <p className="text-sm font-semibold text-gray-900">
                        {formatCurrency(expense.amount, expense.currency?.code)}
                      </p>
                      {expense.currency && !expense.currency.isBase && expense.amountInBaseCurrency != null && (
                        <p className="text-xs text-gray-400">{formatBaseCurrency(expense.amountInBaseCurrency)}</p>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                        {expense.category?.name}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{expense.department?.name}</td>
                    <td className="px-6 py-4 text-sm tabular-nums text-gray-600">
                      {format(new Date(expense.date), "MMM d, yyyy")}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{expense.createdBy?.name}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1">
                        {expense.receiptKey && (
                          <button
                            onClick={() => handleDownloadReceipt(expense.receiptKey!)}
                            className="cursor-pointer rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-blue-600"
                            aria-label="Download receipt"
                          >
                            <Download className="h-4 w-4" />
                          </button>
                        )}
                        <Link
                          href={`/dashboard/expenses/${expense._id}/edit`}
                          className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                          aria-label="Edit expense"
                        >
                          <Pencil className="h-4 w-4" />
                        </Link>
                        <button
                          onClick={() => setDeleteTarget(expense)}
                          className="cursor-pointer rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                          aria-label="Delete expense"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="divide-y divide-gray-100 md:hidden">
            {filteredExpenses.map((expense) => (
              <div key={expense._id} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">{expense.title}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {expense.category?.name} &middot; {expense.department?.name}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {format(new Date(expense.date), "MMM d, yyyy")} &middot; {expense.createdBy?.name}
                    </p>
                  </div>
                  <div className="ml-4 text-right tabular-nums">
                    <p className="text-sm font-bold text-gray-900">
                      {formatCurrency(expense.amount, expense.currency?.code)}
                    </p>
                    {expense.currency && !expense.currency.isBase && expense.amountInBaseCurrency != null && (
                      <p className="text-xs text-gray-400">{formatBaseCurrency(expense.amountInBaseCurrency)}</p>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  {expense.receiptKey && (
                    <button
                      onClick={() => handleDownloadReceipt(expense.receiptKey!)}
                      className="btn-ghost py-1.5 text-xs"
                    >
                      <Paperclip className="h-3.5 w-3.5" /> Receipt
                    </button>
                  )}
                  <Link href={`/dashboard/expenses/${expense._id}/edit`} className="btn-ghost py-1.5 text-xs">
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Link>
                  <button onClick={() => setDeleteTarget(expense)} className="btn-ghost py-1.5 text-xs text-red-600 hover:text-red-700">
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
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
