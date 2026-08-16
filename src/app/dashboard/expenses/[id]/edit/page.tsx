"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useTitle } from "@/hooks/useTitle";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/contexts/AuthContext";
import { FormSkeleton } from "@/components/ui/Skeleton";
import Spinner from "@/components/ui/Spinner";
import ReceiptDropzone from "@/components/ui/ReceiptDropzone";
import { ArrowLeft, Package, Upload, X as XIcon } from "lucide-react";

interface Department {
  _id: string;
  name: string;
  isDefault?: boolean;
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

interface LinkedAsset {
  _id: string;
  assetTag: string;
  name: string;
  allocatedAmount: number;
}

export default function EditExpensePage() {
  useTitle("Edit Expense");
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [linkedAssets, setLinkedAssets] = useState<LinkedAsset[]>([]);

  const emptyForm = {
    title: "",
    amount: "",
    gstAmount: "",
    currency: "",
    category: "",
    department: "",
    date: "",
    description: "",
    paymentSource: "pocket",
  };
  const [form, setForm] = useState(emptyForm);
  const [initialForm, setInitialForm] = useState(emptyForm);
  const [initialHadReceipt, setInitialHadReceipt] = useState(false);

  const [existingReceipt, setExistingReceipt] = useState<{ key: string; filename: string } | null>(null);
  const [newReceipt, setNewReceipt] = useState<{ file: File; filename: string } | null>(null);

  // Warn before discarding unsaved edits on a full page unload.
  const isDirty =
    JSON.stringify(form) !== JSON.stringify(initialForm) ||
    newReceipt !== null ||
    (initialHadReceipt && !existingReceipt && !newReceipt);

  useEffect(() => {
    if (!isDirty || submitting) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty, submitting]);

  const handleCancel = () => {
    if (isDirty && !window.confirm("Discard your changes to this expense?")) {
      return;
    }
    router.push("/dashboard/expenses");
  };

  useEffect(() => {
    async function loadData() {
      try {
        const [expData, lookupData] = await Promise.all([
          api.get(`/api/expenses/${params.id}`),
          api.get("/api/lookups?include=departments,categories,currencies"),
        ]);

        const exp = expData.expense;
        setLinkedAssets(expData.assets || []);
        const loadedForm = {
          title: exp.title,
          amount: exp.amount.toString(),
          gstAmount: exp.gstAmount != null ? exp.gstAmount.toString() : "",
          currency: exp.currency?._id || "",
          category: exp.category?._id || "",
          department: exp.department?._id || "",
          date: new Date(exp.date).toISOString().split("T")[0],
          description: exp.description || "",
          paymentSource: exp.paymentSource || "pocket",
        };
        setForm(loadedForm);
        setInitialForm(loadedForm);

        if (exp.receiptKey) {
          setExistingReceipt({ key: exp.receiptKey, filename: exp.receiptFilename || "Receipt" });
          setInitialHadReceipt(true);
        }

        setDepartments(lookupData.departments);
        setCategories(lookupData.categories);
        setCurrencies(lookupData.currencies);
      } catch {
        toast("Failed to load expense", "error");
        router.push("/dashboard/expenses");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [params.id, toast, router]);

  const handleReceiptFile = (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast("File too large. Maximum size is 10MB.", "error");
      return;
    }
    setNewReceipt({ file, filename: file.name });
    setExistingReceipt(null);
  };

  const uploadReceipt = async (): Promise<{ key: string; filename: string }> => {
    if (!newReceipt?.file) throw new Error("No receipt selected");
    setUploadingReceipt(true);
    try {
      const formData = new FormData();
      formData.append("file", newReceipt.file);

      const result = await api.postFormData("/api/upload", formData);
      return { key: result.key, filename: result.filename };
    } finally {
      setUploadingReceipt(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const gstAmount = form.gstAmount ? parseFloat(form.gstAmount) : null;
    if (gstAmount != null && gstAmount > parseFloat(form.amount)) {
      toast("GST amount cannot exceed the total amount", "error");
      return;
    }

    setSubmitting(true);
    let uploadedReceiptKey: string | null = null;

    try {
      const updateData: Record<string, unknown> = {
        ...form,
        amount: parseFloat(form.amount),
        gstAmount,
      };

      if (newReceipt?.file) {
        const uploaded = await uploadReceipt();
        uploadedReceiptKey = uploaded.key;
        updateData.receiptKey = uploaded.key;
        updateData.receiptFilename = uploaded.filename;
      } else if (initialHadReceipt && !existingReceipt) {
        updateData.receiptKey = null;
        updateData.receiptFilename = null;
      }

      await api.put(`/api/expenses/${params.id}`, updateData);
      toast("Expense updated");
      router.push("/dashboard/expenses");
    } catch (err) {
      if (uploadedReceiptKey) {
        await api.delete(`/api/upload?key=${encodeURIComponent(uploadedReceiptKey)}`).catch(() => undefined);
      }
      toast(err instanceof Error ? err.message : "Failed to update expense", "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <FormSkeleton />;
  const hasLinkedAssets = linkedAssets.length > 0;
  const accountingLocked = hasLinkedAssets && !isAdmin;

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <button
          type="button"
          onClick={handleCancel}
          className="mb-4 inline-flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Expenses
        </button>
        <h1 className="text-2xl font-bold text-foreground">Edit Expense</h1>
      </div>

      <form onSubmit={handleSubmit} className="card mx-auto max-w-2xl p-6">
        {linkedAssets.length > 0 && (
          <div className="mb-5 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-500/30 dark:bg-indigo-500/10">
            <div className="flex items-start gap-3">
              <Package className="mt-0.5 h-5 w-5 text-indigo-600 dark:text-indigo-300" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  Linked to {linkedAssets.length} company asset{linkedAssets.length === 1 ? "" : "s"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  The expense amount and GST cannot be reduced below their asset allocations.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {linkedAssets.map((asset) => (
                    <Link
                      key={asset._id}
                      href={`/dashboard/assets/${asset._id}`}
                      className="rounded-md bg-surface px-2 py-1 text-xs font-semibold text-indigo-700 shadow-sm hover:text-indigo-900 dark:text-indigo-300"
                    >
                      {asset.assetTag} · {asset.name}
                    </Link>
                  ))}
                </div>
                {isAdmin && <Link
                  href={`/dashboard/expenses/${params.id}/assets/new`}
                  className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 hover:text-indigo-900 dark:text-indigo-300"
                >
                  <Package className="h-3.5 w-3.5" /> Add more assets from this expense
                </Link>}
              </div>
            </div>
          </div>
        )}
        {linkedAssets.length === 0 && (
          <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/40 p-4 dark:border-indigo-500/30 dark:bg-indigo-500/5">
            <div><p className="text-sm font-semibold text-foreground">This expense has no linked assets</p><p className="mt-1 text-xs text-muted-foreground">Create inventory records without entering the purchase again.</p></div>
            <Link href={`/dashboard/expenses/${params.id}/assets/new`} className="btn-secondary shrink-0"><Package className="h-4 w-4" /> Create assets</Link>
          </div>
        )}
        <div className="space-y-5">
          <div>
            <label htmlFor="title" className="mb-1.5 block text-sm font-medium text-muted">
              Title <span className="text-red-500 dark:text-red-400">*</span>
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
              <label htmlFor="currency" className="mb-1.5 block text-sm font-medium text-muted">
                Currency <span className="text-red-500 dark:text-red-400">*</span>
              </label>
              <select
                id="currency"
                required
                disabled={hasLinkedAssets}
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
              <label htmlFor="amount" className="mb-1.5 block text-sm font-medium text-muted">
                Amount ({currencies.find((c) => c._id === form.currency)?.symbol || "?"}) <span className="text-red-500 dark:text-red-400">*</span>
              </label>
              <input
                id="amount"
                type="number"
                required
                disabled={accountingLocked}
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="input-field tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="date" className="mb-1.5 block text-sm font-medium text-muted">
                Date <span className="text-red-500 dark:text-red-400">*</span>
              </label>
              <input
                id="date"
                type="date"
                required
                disabled={accountingLocked}
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="input-field"
              />
            </div>
          </div>

          <div>
            <label htmlFor="gstAmount" className="mb-1.5 block text-sm font-medium text-muted">
              GST Amount ({currencies.find((c) => c._id === form.currency)?.symbol || "?"})
              <span className="ml-1 text-xs font-normal text-muted-foreground">— optional</span>
            </label>
            <input
              id="gstAmount"
              type="number"
              min="0"
              disabled={accountingLocked}
              step="0.01"
              value={form.gstAmount}
              onChange={(e) => setForm({ ...form, gstAmount: e.target.value })}
              placeholder="0.00"
              className="input-field tabular-nums"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Tax portion already included in the amount above. Leave blank if not applicable.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="category" className="mb-1.5 block text-sm font-medium text-muted">
                Category <span className="text-red-500 dark:text-red-400">*</span>
              </label>
              <select
                id="category"
                required
                disabled={accountingLocked}
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
              <label htmlFor="department" className="mb-1.5 block text-sm font-medium text-muted">
                Department <span className="text-red-500 dark:text-red-400">*</span>
              </label>
              <select
                id="department"
                required
                disabled={accountingLocked}
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
            <label htmlFor="paymentSource" className="mb-1.5 block text-sm font-medium text-muted">
              Payment Source <span className="text-red-500 dark:text-red-400">*</span>
            </label>
            <select
              id="paymentSource"
              required
              disabled={accountingLocked}
              value={form.paymentSource}
              onChange={(e) => setForm({ ...form, paymentSource: e.target.value })}
              className="input-field"
            >
              <option value="pocket">Paid from pocket</option>
              <option value="company">Paid from company account</option>
            </select>
          </div>

          <div>
            <label htmlFor="description" className="mb-1.5 block text-sm font-medium text-muted">
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
            <label className="mb-1.5 block text-sm font-medium text-muted">Receipt</label>
            {existingReceipt || newReceipt ? (
              <div className="flex items-center gap-3 rounded-lg border border-line bg-subtle px-4 py-3">
                <Upload className="h-5 w-5 text-muted-foreground" />
                <span className="flex-1 truncate text-sm text-muted">
                  {newReceipt?.filename || existingReceipt?.filename}
                </span>
                <button
                  type="button"
                  disabled={accountingLocked}
                  onClick={() => { setNewReceipt(null); setExistingReceipt(null); }}
                  className="cursor-pointer rounded p-1 text-muted-foreground hover:text-muted"
                  aria-label="Remove receipt"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <ReceiptDropzone onFile={handleReceiptFile} acceptPaste disabled={accountingLocked} />
            )}
          </div>
        </div>

        <div className="mt-8 flex justify-end gap-3 border-t border-line pt-6">
          <button type="button" onClick={handleCancel} className="btn-secondary">
            Cancel
          </button>
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
