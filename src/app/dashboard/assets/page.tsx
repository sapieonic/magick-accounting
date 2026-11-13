"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { CircleDot, IndianRupee, Package, PackageCheck, Plus, Tag, Undo2, UserMinus } from "lucide-react";
import { api } from "@/lib/api";
import { formatBaseCurrency } from "@/lib/currency";
import { useAuth } from "@/contexts/AuthContext";
import { useTitle } from "@/hooks/useTitle";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import Field, { selectClass } from "@/components/ui/Field";
import SearchInput from "@/components/ui/SearchInput";
import PageHeader from "@/components/ui/PageHeader";
import Panel from "@/components/ui/Panel";
import Spinner from "@/components/ui/Spinner";
import StatBand, { Stat } from "@/components/ui/StatBand";
import { cn } from "@/components/ui/cn";
import { ICON_STROKE, rowClass } from "@/components/ui/styles";
import AssetRow, { AssetListHead, type AssetListItem } from "@/components/assets/AssetRow";
import { ASSET_STATUSES } from "@/components/assets/AssetStatusBadge";
import { useReceiptOpener } from "@/components/assets/useReceiptOpener";

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

function ShowingCount({ shown, total, noun }: { shown: number; total: number; noun: string }) {
  return (
    <span>
      Showing <span className="num">{shown}</span> of <span className="num">{total}</span> {noun}
    </span>
  );
}

export default function AssetsPage() {
  useTitle("Company assets");
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const { opening: loadingReceipt, openReceipt } = useReceiptOpener();
  const [assets, setAssets] = useState<AssetListItem[]>([]);
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
  const filtered = Boolean(search || status || category);

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
      const data = await api.get(`/api/assets/corrections?limit=20&page=${correctionPage + 1}`);
      setCorrections((current) => [...current, ...(data.corrections || [])]);
      setCorrectionPage((current) => current + 1);
      setCorrectionTotal(data.pagination?.total || correctionTotal);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to load more corrections", "error");
    } finally {
      setLoadingMoreCorrections(false);
    }
  };

  const recordPurchase = (
    <Button icon={Plus} href="/dashboard/expenses/new">
      Record asset purchase
    </Button>
  );

  return (
    <div className="animate-fade-in flex flex-col gap-6">
      <PageHeader
        title={isAdmin ? "Company assets" : "My assets"}
        meta="Purchases, assignments and depreciation in one linked register."
        actions={recordPurchase}
      />

      <StatBand aria-label="Asset totals">
        {isAdmin ? (
          <>
            <Stat
              headline
              label="Capitalized value"
              icon={IndianRupee}
              value={formatBaseCurrency(summary.totalCapitalizedCost)}
              sub={filtered ? "Matching the filters below" : "All company assets"}
            />
            <Stat label="Active assets" icon={PackageCheck} value={summary.activeAssets} />
            <Stat label="Unassigned" icon={UserMinus} value={summary.unassignedAssets} />
          </>
        ) : (
          <>
            <Stat label="Active assets" icon={PackageCheck} value={summary.activeAssets} />
            <Stat label="Visible assets" icon={Package} value={totalCount} />
          </>
        )}
      </StatBand>

      <form
        aria-label="Asset filters"
        role="search"
        onSubmit={(e) => e.preventDefault()}
        className="flex flex-wrap items-end gap-3"
      >
        <Field label="Search assets" className="flex-[3_1_240px]">
          <SearchInput value={searchInput} onValueChange={setSearchInput} placeholder="Asset tag, name, serial or model" />
        </Field>
        <Field label="Status" icon={CircleDot} className="flex-[1_1_160px]">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectClass}>
            <option value="">All statuses</option>
            {ASSET_STATUSES.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Asset category" icon={Tag} className="flex-[1_1_200px]">
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={selectClass}>
            <option value="">All asset categories</option>
            {categories.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </Field>
      </form>

      <Panel
        flush
        title="Asset register"
        meta={!loading && <><span className="num">{totalCount}</span> {totalCount === 1 ? "asset" : "assets"}</>}
        footer={
          !loading &&
          assets.length > 0 && (
            <>
              <ShowingCount shown={assets.length} total={totalCount} noun="assets" />
              {assets.length < totalCount && (
                <Button variant="secondary" size="sm" onClick={loadMore} loading={loadingMore}>
                  {loadingMore ? "Loading..." : "Load more"}
                </Button>
              )}
            </>
          )
        }
      >
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner size="md" />
          </div>
        ) : assets.length === 0 ? (
          <EmptyState
            icon={<Package />}
            title="No assets found"
            description={
              filtered ? "Try adjusting your filters." : "Record an expense and add its company assets in the same form."
            }
            action={filtered ? undefined : recordPurchase}
          />
        ) : (
          <div className="[container-type:inline-size]">
            <AssetListHead />
            <ul aria-label="Assets">
              {assets.map((asset) => (
                <AssetRow
                  key={asset._id}
                  asset={asset}
                  openingReceipt={loadingReceipt === asset._id}
                  onOpenReceipt={(a) => openReceipt(a._id, a.purchaseExpense.receiptKey)}
                />
              ))}
            </ul>
          </div>
        )}
      </Panel>

      {isAdmin && corrections.length > 0 && (
        <Panel
          flush
          title="Recent corrections"
          description="Audited reversals of mistaken or duplicate asset entries."
          footer={
            <>
              <ShowingCount shown={corrections.length} total={correctionTotal} noun="corrections" />
              {corrections.length < correctionTotal && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={loadMoreCorrections}
                  loading={loadingMoreCorrections}
                >
                  {loadingMoreCorrections ? "Loading..." : "Load more corrections"}
                </Button>
              )}
            </>
          }
        >
          <ul aria-label="Corrections">
            {corrections.map((correction) => (
              <li
                key={correction._id}
                className={cn(rowClass, "relative flex min-h-[56px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5")}
              >
                <Undo2 aria-hidden="true" size={16} strokeWidth={ICON_STROKE} className="shrink-0 text-danger" />
                <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-0.5">
                  <Link
                    href={`/dashboard/assets/corrections/${correction._id}`}
                    className="num font-medium text-ink after:absolute after:inset-0 after:content-[''] hover:text-accent"
                  >
                    {correction.assetTag}
                  </Link>
                  <span className="text-xs text-ink-3">{correction.reason}</span>
                </div>
                <div className="ml-auto flex flex-col items-end text-right text-xs text-ink-3">
                  <span className="num">{format(new Date(correction.occurredAt), "d MMM yyyy, HH:mm")}</span>
                  <span>By {correction.actor?.name || "Administrator"}</span>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
