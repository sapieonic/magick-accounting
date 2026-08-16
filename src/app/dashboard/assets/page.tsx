"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import {
  Download,
  IndianRupee,
  Package,
  PackageCheck,
  Plus,
  Search,
  UserMinus,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatBaseCurrency, formatCurrency } from "@/lib/currency";
import { useAuth } from "@/contexts/AuthContext";
import { useTitle } from "@/hooks/useTitle";
import { useToast } from "@/components/ui/Toast";
import EmptyState from "@/components/ui/EmptyState";
import Spinner from "@/components/ui/Spinner";

interface Asset {
  _id: string;
  assetTag: string;
  name: string;
  assetCategory: string;
  serialNumber: string;
  make: string;
  assetModel: string;
  status: string;
  capitalizedCost?: number;
  bookValue?: number;
  canViewFinancials: boolean;
  depreciationMethod?: string;
  depreciationRate?: number;
  assignedTo?: { _id: string; name: string; email: string } | null;
  department: { _id: string; name: string };
  purchaseExpense: {
    _id: string;
    title: string;
    date: string;
    receiptKey?: string;
    receiptFilename?: string;
    currency?: { code: string; symbol: string };
  };
}

interface AssetSummary {
  activeAssets: number;
  totalCapitalizedCost: number;
  unassignedAssets: number;
}

interface CorrectionEvent {
  _id: string;
  assetTag: string;
  reason: string;
  occurredAt: string;
  actor?: { name: string; email: string };
}

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  under_repair: "Under repair",
  retired: "Retired",
  sold: "Sold",
  lost: "Lost",
  disposed: "Disposed",
};

const STATUS_STYLES: Record<string, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
  under_repair: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
  retired: "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-500/30 dark:bg-slate-500/10 dark:text-slate-300",
  sold: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300",
  lost: "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300",
  disposed: "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-500/30 dark:bg-slate-500/10 dark:text-slate-300",
};

export default function AssetsPage() {
  useTitle("Company Assets");
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [summary, setSummary] = useState<AssetSummary>({
    activeAssets: 0,
    totalCapitalizedCost: 0,
    unassignedAssets: 0,
  });
  const [corrections, setCorrections] = useState<CorrectionEvent[]>([]);
  const [correctionPage, setCorrectionPage] = useState(1);
  const [correctionTotal, setCorrectionTotal] = useState(0);
  const [loadingMoreCorrections, setLoadingMoreCorrections] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loadingReceipt, setLoadingReceipt] = useState<string | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  const loadAssets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "25", page: "1" });
      if (search) params.set("search", search);
      if (status) params.set("status", status);
      if (category) params.set("category", category);
      const data = await api.get(`/api/assets?${params.toString()}`);
      setAssets(data.assets || []);
      setPage(1);
      setTotalCount(data.pagination?.total || 0);
      setCategories(data.categories || []);
      setSummary(data.summary || { activeAssets: 0, totalCapitalizedCost: 0, unassignedAssets: 0 });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to load assets", "error");
    } finally {
      setLoading(false);
    }
  }, [search, status, category, toast]);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  const loadCorrections = useCallback(async () => {
    if (!isAdmin) {
      setCorrections([]);
      return;
    }
    try {
      const data = await api.get("/api/assets/corrections?limit=20&page=1");
      setCorrections(data.corrections || []);
      setCorrectionPage(1);
      setCorrectionTotal(data.pagination?.total || 0);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to load corrections", "error");
    }
  }, [isAdmin, toast]);

  useEffect(() => {
    void loadCorrections();
  }, [loadCorrections]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ limit: "25", page: String(page + 1) });
      if (search) params.set("search", search);
      if (status) params.set("status", status);
      if (category) params.set("category", category);
      const data = await api.get(`/api/assets?${params.toString()}`);
      setAssets((current) => [...current, ...(data.assets || [])]);
      setPage((current) => current + 1);
      setTotalCount(data.pagination?.total || totalCount);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to load more assets", "error");
    } finally {
      setLoadingMore(false);
    }
  };

  const loadMoreCorrections = async () => {
    setLoadingMoreCorrections(true);
    try {
      const data = await api.get(
        `/api/assets/corrections?limit=20&page=${correctionPage + 1}`
      );
      setCorrections((current) => [...current, ...(data.corrections || [])]);
      setCorrectionPage((current) => current + 1);
      setCorrectionTotal(data.pagination?.total || correctionTotal);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to load more corrections", "error");
    } finally {
      setLoadingMoreCorrections(false);
    }
  };

  const openReceipt = async (asset: Asset) => {
    if (!asset.purchaseExpense.receiptKey) return;
    setLoadingReceipt(asset._id);
    try {
      const data = await api.get(
        `/api/upload?key=${encodeURIComponent(asset.purchaseExpense.receiptKey)}`
      );
      window.open(data.downloadUrl, "_blank", "noopener,noreferrer");
    } catch {
      toast("Failed to open purchase receipt", "error");
    } finally {
      setLoadingReceipt(null);
    }
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {isAdmin ? "Company Assets" : "My Assets"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Purchases, assignments and depreciation in one linked register.
          </p>
        </div>
        <Link href="/dashboard/expenses/new" className="btn-primary">
          <Plus className="h-4 w-4" /> Record asset purchase
        </Link>
      </div>

      <div className={`grid gap-4 ${isAdmin ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-indigo-100 p-2.5 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300"><PackageCheck className="h-5 w-5" /></div>
            <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Active assets</p><p className="mt-1 text-2xl font-bold text-foreground">{summary.activeAssets}</p></div>
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-emerald-100 p-2.5 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">{isAdmin ? <IndianRupee className="h-5 w-5" /> : <Package className="h-5 w-5" />}</div>
            <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{isAdmin ? "Capitalized value" : "Visible assets"}</p><p className="mt-1 text-xl font-bold text-foreground">{isAdmin ? formatBaseCurrency(summary.totalCapitalizedCost) : totalCount}</p></div>
          </div>
        </div>
        {isAdmin && <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-amber-100 p-2.5 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300"><UserMinus className="h-5 w-5" /></div>
            <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Unassigned</p><p className="mt-1 text-2xl font-bold text-foreground">{summary.unassignedAssets}</p></div>
          </div>
        </div>}
      </div>

      <div className="card p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_180px_220px]">
          <label className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              aria-label="Search assets"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search asset tag, name, serial or model"
              className="input-field pl-9"
            />
          </label>
          <select aria-label="Filter by asset status" value={status} onChange={(e) => setStatus(e.target.value)} className="input-field">
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select aria-label="Filter by asset category" value={category} onChange={(e) => setCategory(e.target.value)} className="input-field">
            <option value="">All asset categories</option>
            {categories.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="md" /></div>
      ) : assets.length === 0 ? (
        <EmptyState
          icon={<Package className="h-7 w-7" />}
          title="No assets found"
          description={search || status || category ? "Try adjusting your filters." : "Record an expense and add its company assets in the same form."}
          action={search || status || category ? undefined : (
            <Link href="/dashboard/expenses/new" className="btn-primary">
              <Plus className="h-4 w-4" /> Record asset purchase
            </Link>
          )}
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-subtle/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr><th className="px-5 py-3">Asset</th><th className="px-5 py-3">Purchase</th><th className="px-5 py-3">Assigned to</th><th className="px-5 py-3 text-right">Book value</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Receipt</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {assets.map((asset) => {
                  const currencyCode = asset.purchaseExpense.currency?.code || "INR";
                  return (
                    <tr key={asset._id} className="hover:bg-subtle/30">
                      <td className="px-5 py-4"><Link href={`/dashboard/assets/${asset._id}`} className="font-semibold text-foreground hover:text-brand-600">{asset.name}</Link><p className="mt-1 font-mono text-xs text-brand-600 dark:text-brand-400">{asset.assetTag}</p><p className="mt-1 text-xs text-muted-foreground">{asset.assetCategory}{asset.serialNumber ? ` · S/N ${asset.serialNumber}` : ""}</p></td>
                      <td className="px-5 py-4">{asset.canViewFinancials ? <Link href={`/dashboard/expenses/${asset.purchaseExpense._id}/edit`} className="text-muted hover:text-brand-600">{asset.purchaseExpense.title}</Link> : <span className="text-muted">{asset.purchaseExpense.title}</span>}<p className="mt-1 text-xs text-muted-foreground">{format(new Date(asset.purchaseExpense.date), "dd MMM yyyy")}</p></td>
                      <td className="px-5 py-4"><p className="text-muted">{asset.assignedTo?.name || "Unassigned"}</p><p className="mt-1 text-xs text-muted-foreground">{asset.department?.name}</p></td>
                      <td className="px-5 py-4 text-right">{asset.canViewFinancials && asset.bookValue != null && asset.capitalizedCost != null ? <><p className="font-semibold tabular-nums text-foreground">{formatCurrency(asset.bookValue, currencyCode)}</p><p className="mt-1 text-xs text-muted-foreground">Cost {formatCurrency(asset.capitalizedCost, currencyCode)}</p></> : <span className="text-xs text-muted-foreground">Restricted</span>}</td>
                      <td className="px-5 py-4"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[asset.status] || STATUS_STYLES.retired}`}>{STATUS_LABELS[asset.status] || asset.status}</span></td>
                      <td className="px-5 py-4 text-right">{asset.purchaseExpense.receiptKey ? <button type="button" onClick={() => openReceipt(asset)} disabled={loadingReceipt === asset._id} className="rounded-lg p-2 text-muted-foreground hover:bg-subtle hover:text-brand-600" aria-label={`Open receipt for ${asset.name}`}>{loadingReceipt === asset._id ? <Spinner size="sm" /> : <Download className="h-4 w-4" />}</button> : <span className="text-xs text-muted-foreground">None</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-line md:hidden">
            {assets.map((asset) => (
              <Link key={asset._id} href={`/dashboard/assets/${asset._id}`} className="block p-4 hover:bg-subtle/30">
                <div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-foreground">{asset.name}</p><p className="mt-1 font-mono text-xs text-brand-600">{asset.assetTag}</p></div><span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${STATUS_STYLES[asset.status] || STATUS_STYLES.retired}`}>{STATUS_LABELS[asset.status] || asset.status}</span></div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-xs"><div><p className="text-muted-foreground">Assigned to</p><p className="mt-1 text-muted">{asset.assignedTo?.name || "Unassigned"}</p></div><div><p className="text-muted-foreground">Capitalized cost</p><p className="mt-1 font-semibold text-foreground">{asset.canViewFinancials && asset.capitalizedCost != null ? formatCurrency(asset.capitalizedCost, asset.purchaseExpense.currency?.code || "INR") : "Restricted"}</p></div></div>
              </Link>
            ))}
          </div>
        </div>
      )}
      {!loading && assets.length > 0 && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs text-muted-foreground">Showing {assets.length} of {totalCount} assets</p>
          {assets.length < totalCount && <button type="button" onClick={loadMore} disabled={loadingMore} className="btn-secondary">{loadingMore ? <><Spinner size="sm" /> Loading...</> : "Load more"}</button>}
        </div>
      )}
      {isAdmin && corrections.length > 0 && (
        <div className="card p-5">
          <h2 className="font-heading text-base font-bold text-foreground">Recent corrections</h2>
          <p className="mt-1 text-xs text-muted-foreground">Audited reversals of mistaken or duplicate asset entries.</p>
          <div className="mt-4 divide-y divide-line border-t border-line">
            {corrections.map((correction) => (
              <div key={correction._id} className="flex flex-col justify-between gap-2 py-3 text-sm sm:flex-row">
                <div><Link href={`/dashboard/assets/corrections/${correction._id}`} className="font-mono font-semibold text-foreground hover:text-brand-600">{correction.assetTag}</Link><p className="mt-1 text-xs text-muted-foreground">{correction.reason}</p></div>
                <div className="text-xs text-muted-foreground sm:text-right"><p>{format(new Date(correction.occurredAt), "dd MMM yyyy, HH:mm")}</p><p className="mt-1">By {correction.actor?.name || "Administrator"}</p></div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-col items-center gap-2 border-t border-line pt-4">
            <p className="text-xs text-muted-foreground">Showing {corrections.length} of {correctionTotal} corrections</p>
            {corrections.length < correctionTotal && <button type="button" onClick={loadMoreCorrections} disabled={loadingMoreCorrections} className="btn-secondary">{loadingMoreCorrections ? <><Spinner size="sm" /> Loading...</> : "Load more corrections"}</button>}
          </div>
        </div>
      )}
    </div>
  );
}
