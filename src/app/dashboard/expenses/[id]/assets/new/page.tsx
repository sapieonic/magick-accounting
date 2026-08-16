"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, PackagePlus } from "lucide-react";
import AssetPurchaseSection, {
  AssetDraft,
  createEmptyAsset,
} from "@/components/assets/AssetPurchaseSection";
import { FormSkeleton } from "@/components/ui/Skeleton";
import Spinner from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/contexts/AuthContext";
import { useTitle } from "@/hooks/useTitle";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/currency";
import { moneyToCents } from "@/lib/asset";

interface UserOption { _id: string; name: string; email: string }
interface ExistingAsset { allocatedAmount: number; allocatedGstAmount: number }
interface ExpenseData {
  _id: string;
  title: string;
  amount: number;
  gstAmount?: number | null;
  date: string;
  currency?: { _id: string; code: string; symbol: string };
}

export default function AddAssetsToExpensePage() {
  useTitle("Create Assets from Expense");
  const params = useParams();
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const [expense, setExpense] = useState<ExpenseData | null>(null);
  const [existingAssets, setExistingAssets] = useState<ExistingAsset[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [assets, setAssets] = useState<AssetDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const requests: Promise<unknown>[] = [api.get(`/api/expenses/${params.id}`)];
        if (isAdmin) requests.push(api.get("/api/users"));
        const results = await Promise.all(requests);
        const data = results[0] as { expense: ExpenseData; assets: ExistingAsset[] };
        setExpense(data.expense);
        setExistingAssets(data.assets || []);
        setAssets([
          createEmptyAsset(
            new Date(data.expense.date).toISOString().split("T")[0],
            user?._id || ""
          ),
        ]);
        if (isAdmin) setUsers((results[1] as { users: UserOption[] }).users || []);
      } catch (err) {
        toast(err instanceof Error ? err.message : "Failed to load expense", "error");
        router.push("/dashboard/expenses");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [params.id, isAdmin, user?._id, router, toast]);

  const remaining = useMemo(() => {
    const allocatedCents = existingAssets.reduce(
      (total, asset) => total + moneyToCents(asset.allocatedAmount),
      0
    );
    const allocatedGstCents = existingAssets.reduce(
      (total, asset) => total + moneyToCents(asset.allocatedGstAmount),
      0
    );
    return {
      amount: Math.max(0, moneyToCents(expense?.amount) - allocatedCents) / 100,
      gst: Math.max(0, moneyToCents(expense?.gstAmount) - allocatedGstCents) / 100,
    };
  }, [existingAssets, expense]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!expense || assets.length === 0) return;
    const allocatedCents = assets.reduce(
      (total, asset) => total + moneyToCents(asset.allocatedAmount),
      0
    );
    const allocatedGstCents = assets.reduce(
      (total, asset) => total + moneyToCents(asset.allocatedGstAmount),
      0
    );
    if (
      allocatedCents > moneyToCents(remaining.amount) ||
      allocatedGstCents > moneyToCents(remaining.gst)
    ) {
      toast("Asset allocations exceed the remaining expense amount or GST", "error");
      return;
    }
    setSaving(true);
    try {
      await api.post(`/api/expenses/${expense._id}/assets`, {
        assets: assets.map(({ id: _id, ...asset }) => asset),
      });
      toast("Assets created from the existing expense");
      router.push("/dashboard/assets");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to create assets", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !expense) return <FormSkeleton />;
  const currencyCode = expense.currency?.code || "INR";

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <Link href={`/dashboard/expenses/${expense._id}/edit`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back to Expense</Link>
        <div className="flex items-start gap-3"><div className="rounded-xl bg-indigo-100 p-3 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300"><PackagePlus className="h-6 w-6" /></div><div><h1 className="text-2xl font-bold text-foreground">Create assets from expense</h1><p className="mt-1 text-sm text-muted-foreground">{expense.title}</p></div></div>
      </div>

      <div className="card grid gap-4 p-5 sm:grid-cols-3">
        <div><p className="text-xs uppercase tracking-wider text-muted-foreground">Expense total</p><p className="mt-1 font-semibold text-foreground">{formatCurrency(expense.amount, currencyCode)}</p></div>
        <div><p className="text-xs uppercase tracking-wider text-muted-foreground">Remaining allocation</p><p className="mt-1 font-semibold text-foreground">{formatCurrency(remaining.amount, currencyCode)}</p></div>
        <div><p className="text-xs uppercase tracking-wider text-muted-foreground">Remaining GST</p><p className="mt-1 font-semibold text-foreground">{formatCurrency(remaining.gst, currencyCode)}</p></div>
      </div>

      <form onSubmit={submit} className="card p-5">
        <AssetPurchaseSection
          assets={assets}
          onChange={setAssets}
          purchaseDate={new Date(expense.date).toISOString().split("T")[0]}
          currencySymbol={expense.currency?.symbol || "₹"}
          users={users}
          canAssignOthers={isAdmin}
          currentUser={user ? { _id: user._id, name: user.name, email: user.email } : null}
        />
        <div className="mt-6 flex justify-end border-t border-line pt-5"><button type="submit" className="btn-primary" disabled={saving || assets.length === 0}>{saving ? <><Spinner size="sm" /> Creating...</> : "Create linked assets"}</button></div>
      </form>
    </div>
  );
}
