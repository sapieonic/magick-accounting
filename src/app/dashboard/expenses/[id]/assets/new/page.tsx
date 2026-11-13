"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PackagePlus } from "lucide-react";
import AssetPurchaseSection, {
  AssetDraft,
  createEmptyAsset,
} from "@/components/assets/AssetPurchaseSection";
import Button from "@/components/ui/Button";
import PageHeader from "@/components/ui/PageHeader";
import { panelClass } from "@/components/ui/styles";
import { cn } from "@/components/ui/cn";
import StatBand, { Stat } from "@/components/ui/StatBand";
import { FormSkeleton } from "@/components/ui/Skeleton";
import FormSection, { FormFooter } from "@/components/ui/FormSection";
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
  useTitle("Create assets from expense");
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
    <div className="animate-fade-in flex flex-col gap-6">
      <PageHeader
        breadcrumb={[
          { label: "Expenses", href: "/dashboard/expenses" },
          { label: expense.title, href: `/dashboard/expenses/${expense._id}/edit` },
          { label: "Create assets" },
        ]}
        title="Create assets from expense"
        meta={expense.title}
      />

      <StatBand aria-label="Allocation">
        <Stat headline label="Expense total" value={formatCurrency(expense.amount, currencyCode)} />
        <Stat label="Remaining allocation" value={formatCurrency(remaining.amount, currencyCode)} />
        <Stat label="Remaining GST" value={formatCurrency(remaining.gst, currencyCode)} />
      </StatBand>

      <form onSubmit={submit} aria-label="Assets to create" className={cn(panelClass, "flex min-w-0 flex-col")}>
        <FormSection>
          <AssetPurchaseSection
            assets={assets}
            onChange={setAssets}
            purchaseDate={new Date(expense.date).toISOString().split("T")[0]}
            currencySymbol={expense.currency?.symbol || "₹"}
            users={users}
            canAssignOthers={isAdmin}
            currentUser={user ? { _id: user._id, name: user.name, email: user.email } : null}
          />
        </FormSection>
        <FormFooter className="justify-end">
          <Button type="submit" icon={PackagePlus} loading={saving} disabled={assets.length === 0}>
            {saving ? "Creating…" : "Create linked assets"}
          </Button>
        </FormFooter>
      </form>
    </div>
  );
}
