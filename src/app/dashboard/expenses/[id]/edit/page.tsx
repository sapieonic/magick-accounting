"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { api } from "@/lib/api";
import { useTitle } from "@/hooks/useTitle";
import { useToast } from "@/components/ui/Toast";
import { PageLoader } from "@/components/ui/Spinner";
import Spinner from "@/components/ui/Spinner";
import { ArrowLeft, Upload, X as XIcon } from "lucide-react";
import Link from "next/link";

interface Department {
  _id: string;
  name: string;
}

interface Category {
  _id: string;
  name: string;
}

interface CurrencyOption {
  _id: string;
  code: string;
  name: string;
  symbol: string;
  isBase: boolean;
}

export default function EditExpensePage() {
  useTitle("Edit Expense");
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);

  const [form, setForm] = useState({
    title: "",
    amount: "",
    currency: "",
    category: "",
    department: "",
    date: "",
    description: "",
  });

  const [existingReceipt, setExistingReceipt] = useState<{ key: string; filename: string } | null>(null);
  const [newReceipt, setNewReceipt] = useState<{ file: File; filename: string } | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const [expData, deptData, catData, currData] = await Promise.all([
          api.get(`/api/expenses/${params.id}`),
          api.get("/api/departments"),
          api.get("/api/categories"),
          api.get("/api/currencies"),
        ]);

        const exp = expData.expense;
        setForm({
          title: exp.title,
          amount: exp.amount.toString(),
          currency: exp.currency?._id || "",
          category: exp.category?._id || "",
          department: exp.department?._id || "",
          date: new Date(exp.date).toISOString().split("T")[0],
          description: exp.description || "",
        });

        if (exp.receiptKey) {
          setExistingReceipt({ key: exp.receiptKey, filename: exp.receiptFilename || "Receipt" });
        }

        setDepartments(deptData.departments);
        setCategories(catData.categories);
        setCurrencies(currData.currencies);
      } catch {
        toast("Failed to load expense", "error");
        router.push("/dashboard/expenses");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [params.id, toast, router]);

  const handleReceiptSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast("File too large. Maximum size is 10MB.", "error");
      return;
    }
    setNewReceipt({ file, filename: file.name });
    setExistingReceipt(null);
  };

  const uploadReceipt = async (): Promise<{ key: string; filename: string } | null> => {
    if (!newReceipt?.file) return null;
    setUploadingReceipt(true);
    try {
      const { uploadUrl, key } = await api.post("/api/upload", {
        filename: newReceipt.file.name,
        contentType: newReceipt.file.type,
      });

      await fetch(uploadUrl, {
        method: "PUT",
        body: newReceipt.file,
        headers: {
          "Content-Type": newReceipt.file.type,
        },
      });

      return { key, filename: newReceipt.file.name };
    } catch {
      toast("Failed to upload receipt", "error");
      return null;
    } finally {
      setUploadingReceipt(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const updateData: Record<string, unknown> = {
        ...form,
        amount: parseFloat(form.amount),
      };

      if (newReceipt?.file) {
        const uploaded = await uploadReceipt();
        if (uploaded) {
          updateData.receiptKey = uploaded.key;
          updateData.receiptFilename = uploaded.filename;
        }
      }

      await api.put(`/api/expenses/${params.id}`, updateData);
      toast("Expense updated");
      router.push("/dashboard/expenses");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to update expense", "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <PageLoader />;

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <Link href="/dashboard/expenses" className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft className="h-4 w-4" />
          Back to Expenses
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Edit Expense</h1>
      </div>

      <form onSubmit={handleSubmit} className="card mx-auto max-w-2xl p-6">
        <div className="space-y-5">
          <div>
            <label htmlFor="title" className="mb-1.5 block text-sm font-medium text-gray-700">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              id="title"
              type="text"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="input-field"
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            <div>
              <label htmlFor="currency" className="mb-1.5 block text-sm font-medium text-gray-700">
                Currency <span className="text-red-500">*</span>
              </label>
              <select
                id="currency"
                required
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className="input-field"
              >
                <option value="">Select</option>
                {currencies.map((c) => (
                  <option key={c._id} value={c._id}>{c.symbol} {c.code}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="amount" className="mb-1.5 block text-sm font-medium text-gray-700">
                Amount ({currencies.find((c) => c._id === form.currency)?.symbol || "?"}) <span className="text-red-500">*</span>
              </label>
              <input
                id="amount"
                type="number"
                required
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="input-field tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="date" className="mb-1.5 block text-sm font-medium text-gray-700">
                Date <span className="text-red-500">*</span>
              </label>
              <input
                id="date"
                type="date"
                required
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="input-field"
              />
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="category" className="mb-1.5 block text-sm font-medium text-gray-700">
                Category <span className="text-red-500">*</span>
              </label>
              <select
                id="category"
                required
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="input-field"
              >
                <option value="">Select a category</option>
                {categories.map((c) => (
                  <option key={c._id} value={c._id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="department" className="mb-1.5 block text-sm font-medium text-gray-700">
                Department <span className="text-red-500">*</span>
              </label>
              <select
                id="department"
                required
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
                className="input-field"
              >
                <option value="">Select a department</option>
                {departments.map((d) => (
                  <option key={d._id} value={d._id}>{d.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="description" className="mb-1.5 block text-sm font-medium text-gray-700">
              Description
            </label>
            <textarea
              id="description"
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="input-field resize-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Receipt</label>
            {existingReceipt || newReceipt ? (
              <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                <Upload className="h-5 w-5 text-gray-400" />
                <span className="flex-1 truncate text-sm text-gray-700">
                  {newReceipt?.filename || existingReceipt?.filename}
                </span>
                <button
                  type="button"
                  onClick={() => { setNewReceipt(null); setExistingReceipt(null); }}
                  className="cursor-pointer rounded p-1 text-gray-400 hover:text-gray-600"
                  aria-label="Remove receipt"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-gray-200 px-4 py-8 transition-colors hover:border-brand-300 hover:bg-brand-50/30">
                <Upload className="h-8 w-8 text-gray-300" />
                <span className="text-sm text-gray-500">Click to upload receipt</span>
                <span className="text-xs text-gray-400">JPEG, PNG, WebP, or PDF up to 10MB</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={handleReceiptSelect}
                  className="hidden"
                />
              </label>
            )}
          </div>
        </div>

        <div className="mt-8 flex justify-end gap-3 border-t border-gray-100 pt-6">
          <Link href="/dashboard/expenses" className="btn-secondary">
            Cancel
          </Link>
          <button type="submit" className="btn-primary" disabled={submitting || uploadingReceipt}>
            {submitting || uploadingReceipt ? (
              <>
                <Spinner size="sm" /> Saving...
              </>
            ) : (
              "Update Expense"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
