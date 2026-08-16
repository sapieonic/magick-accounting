"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft, Download, ExternalLink, History, Package } from "lucide-react";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/currency";
import { useAuth } from "@/contexts/AuthContext";
import { useTitle } from "@/hooks/useTitle";
import { useToast } from "@/components/ui/Toast";
import Spinner from "@/components/ui/Spinner";
import { FormSkeleton } from "@/components/ui/Skeleton";

interface UserOption { _id: string; name: string; email: string }
interface DepartmentOption { _id: string; name: string }

interface AssetDetail {
  _id: string;
  assetTag: string;
  name: string;
  assetCategory: string;
  serialNumber: string;
  make: string;
  assetModel: string;
  purpose: string;
  location: string;
  allocatedAmount?: number;
  allocatedGstAmount?: number;
  recoverableGstAmount?: number;
  capitalizedCost?: number;
  accumulatedDepreciation?: number;
  bookValue?: number;
  canViewFinancials: boolean;
  depreciationMethod?: "none" | "straight_line" | "written_down_value";
  depreciationRate?: number;
  residualValue?: number;
  putToUseDate: string;
  status: string;
  lifecycleDate?: string | null;
  disposalProceeds?: number | null;
  lifecycleNotes?: string;
  assignedTo?: UserOption | null;
  department: DepartmentOption;
  purchaseExpense: {
    _id: string;
    title: string;
    amount: number;
    gstAmount?: number | null;
    date: string;
    receiptKey?: string;
    receiptFilename?: string;
    currency?: { code: string; symbol: string };
  };
}

interface Assignment {
  _id: string;
  assignedTo: UserOption;
  assignedBy: UserOption;
  department: DepartmentOption;
  purpose: string;
  location: string;
  assignedAt: string;
  returnedAt?: string | null;
}

interface EditForm {
  name: string;
  assetCategory: string;
  serialNumber: string;
  make: string;
  assetModel: string;
  assignedTo: string;
  department: string;
  purpose: string;
  location: string;
  status: string;
  depreciationMethod: "none" | "straight_line" | "written_down_value";
  depreciationRate: string;
  residualValue: string;
  putToUseDate: string;
  lifecycleDate: string;
  disposalProceeds: string;
  lifecycleNotes: string;
}

interface AssetEvent {
  _id: string;
  type: string;
  reason: string;
  changes: Record<string, { from: unknown; to: unknown }>;
  occurredAt: string;
  actor?: UserOption;
}

const STATUS_OPTIONS = [
  ["active", "Active"],
  ["under_repair", "Under repair"],
  ["retired", "Retired"],
  ["sold", "Sold"],
  ["lost", "Lost"],
  ["disposed", "Disposed"],
];
const TERMINAL_STATUSES = new Set(["retired", "sold", "lost", "disposed"]);

export default function AssetDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [asset, setAsset] = useState<AssetDetail | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [events, setEvents] = useState<AssetEvent[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [form, setForm] = useState<EditForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openingReceipt, setOpeningReceipt] = useState(false);
  const [reversing, setReversing] = useState(false);
  useTitle(asset?.name || "Asset");

  useEffect(() => {
    async function load() {
      try {
        const requests: Promise<unknown>[] = [api.get(`/api/assets/${params.id}`)];
        if (isAdmin) {
          requests.push(api.get("/api/users"));
          requests.push(api.get("/api/lookups?include=departments"));
        }
        const results = await Promise.all(requests);
        const assetData = results[0] as { asset: AssetDetail; assignments: Assignment[]; events: AssetEvent[] };
        const loaded = assetData.asset;
        setAsset(loaded);
        setAssignments(assetData.assignments || []);
        setForm({
          name: loaded.name,
          assetCategory: loaded.assetCategory,
          serialNumber: loaded.serialNumber || "",
          make: loaded.make || "",
          assetModel: loaded.assetModel || "",
          assignedTo: loaded.assignedTo?._id || "",
          department: loaded.department?._id || "",
          purpose: loaded.purpose || "",
          location: loaded.location || "",
          status: loaded.status,
          depreciationMethod: loaded.depreciationMethod || "none",
          depreciationRate: String(loaded.depreciationRate || ""),
          residualValue: String(loaded.residualValue || 0),
          putToUseDate: new Date(loaded.putToUseDate).toISOString().split("T")[0],
          lifecycleDate: loaded.lifecycleDate
            ? new Date(loaded.lifecycleDate).toISOString().split("T")[0]
            : "",
          disposalProceeds:
            loaded.disposalProceeds != null ? String(loaded.disposalProceeds) : "",
          lifecycleNotes: loaded.lifecycleNotes || "",
        });
        setEvents(assetData.events || []);
        if (isAdmin) {
          setUsers(((results[1] as { users: UserOption[] }).users || []));
          setDepartments(((results[2] as { departments: DepartmentOption[] }).departments || []));
        }
      } catch (err) {
        toast(err instanceof Error ? err.message : "Failed to load asset", "error");
        router.push("/dashboard/assets");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [params.id, isAdmin, router, toast]);

  const updateForm = <K extends keyof EditForm>(field: K, value: EditForm[K]) => {
    setForm((current) => current ? { ...current, [field]: value } : current);
  };

  const updateStatus = (status: string) => {
    setForm((current) => {
      if (!current) return current;
      const today = new Date().toISOString().split("T")[0];
      return {
        ...current,
        status,
        lifecycleDate:
          TERMINAL_STATUSES.has(status) && !current.lifecycleDate ? today : current.lifecycleDate,
      };
    });
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form || !isAdmin) return;
    setSaving(true);
    try {
      const data = await api.put(`/api/assets/${params.id}`, {
        ...form,
        depreciationRate: form.depreciationMethod === "none" ? 0 : Number(form.depreciationRate),
        residualValue: Number(form.residualValue || 0),
      });
      setAsset(data.asset);
      toast("Asset updated");
      const refreshed = await api.get(`/api/assets/${params.id}`);
      setAsset(refreshed.asset);
      setAssignments(refreshed.assignments || []);
      setEvents(refreshed.events || []);
      if (TERMINAL_STATUSES.has(form.status)) {
        setForm((current) => current ? { ...current, assignedTo: "" } : current);
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to update asset", "error");
    } finally {
      setSaving(false);
    }
  };

  const reverseAsset = async () => {
    const reason = window.prompt(
      "Why is this asset being reversed? This is only for correcting a mistaken or duplicate entry."
    )?.trim();
    if (!reason) return;
    setReversing(true);
    try {
      await api.delete(`/api/assets/${params.id}`, { reason });
      toast("Asset correction recorded");
      router.push("/dashboard/assets");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to reverse asset", "error");
    } finally {
      setReversing(false);
    }
  };

  const openReceipt = async () => {
    if (!asset?.purchaseExpense.receiptKey) return;
    setOpeningReceipt(true);
    try {
      const data = await api.get(
        `/api/upload?key=${encodeURIComponent(asset.purchaseExpense.receiptKey)}`
      );
      window.open(data.downloadUrl, "_blank", "noopener,noreferrer");
    } catch {
      toast("Failed to open purchase receipt", "error");
    } finally {
      setOpeningReceipt(false);
    }
  };

  if (loading || !asset || !form) return <FormSkeleton />;
  const currencyCode = asset.purchaseExpense.currency?.code || "INR";

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <Link href="/dashboard/assets" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to Assets
        </Link>
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-indigo-100 p-3 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300"><Package className="h-6 w-6" /></div>
            <div><h1 className="text-2xl font-bold text-foreground">{asset.name}</h1><p className="mt-1 font-mono text-sm font-semibold text-brand-600 dark:text-brand-400">{asset.assetTag}</p></div>
          </div>
          <span className="inline-flex self-start rounded-full border border-line bg-subtle px-3 py-1.5 text-xs font-semibold capitalize text-muted">{asset.status.replaceAll("_", " ")}</span>
        </div>
      </div>

      {asset.canViewFinancials && asset.capitalizedCost != null && asset.accumulatedDepreciation != null && asset.bookValue != null && <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-5"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Capitalized cost</p><p className="mt-2 text-xl font-bold text-foreground">{formatCurrency(asset.capitalizedCost, currencyCode)}</p></div>
        <div className="card p-5"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Accumulated depreciation</p><p className="mt-2 text-xl font-bold text-foreground">{formatCurrency(asset.accumulatedDepreciation, currencyCode)}</p></div>
        <div className="card p-5"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Current book value</p><p className="mt-2 text-xl font-bold text-foreground">{formatCurrency(asset.bookValue, currencyCode)}</p></div>
      </div>}

      <div className="card p-5">
        <div className="mb-4 flex items-center justify-between"><div><h2 className="font-heading text-base font-bold text-foreground">Purchase record</h2><p className="mt-1 text-xs text-muted-foreground">{asset.canViewFinancials ? "Financial values come from the linked expense and are not entered again." : "Purchase financials and receipt are visible only to the expense owner and administrators."}</p></div>{asset.canViewFinancials && <Link href={`/dashboard/expenses/${asset.purchaseExpense._id}/edit`} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700">View expense <ExternalLink className="h-3.5 w-3.5" /></Link>}</div>
        <div className="grid gap-4 border-t border-line pt-4 text-sm sm:grid-cols-4">
          <div><p className="text-xs text-muted-foreground">Expense</p><p className="mt-1 font-medium text-foreground">{asset.purchaseExpense.title}</p></div>
          <div><p className="text-xs text-muted-foreground">Purchase date</p><p className="mt-1 font-medium text-foreground">{format(new Date(asset.purchaseExpense.date), "dd MMM yyyy")}</p></div>
          <div><p className="text-xs text-muted-foreground">Asset allocation</p><p className="mt-1 font-medium text-foreground">{asset.canViewFinancials && asset.allocatedAmount != null && asset.allocatedGstAmount != null ? <>{formatCurrency(asset.allocatedAmount, currencyCode)} <span className="text-xs text-muted-foreground">(GST {formatCurrency(asset.allocatedGstAmount, currencyCode)})</span></> : "Restricted"}</p></div>
          <div><p className="text-xs text-muted-foreground">Receipt</p>{asset.purchaseExpense.receiptKey ? <button type="button" onClick={openReceipt} disabled={openingReceipt} className="mt-1 inline-flex items-center gap-1.5 font-semibold text-brand-600 hover:text-brand-700">{openingReceipt ? <Spinner size="sm" /> : <Download className="h-4 w-4" />} {asset.purchaseExpense.receiptFilename || "Open receipt"}</button> : <p className="mt-1 text-muted">No receipt</p>}</div>
        </div>
      </div>

      <form onSubmit={save} className="card p-5">
        <div className="mb-5"><h2 className="font-heading text-base font-bold text-foreground">Asset details</h2><p className="mt-1 text-xs text-muted-foreground">{isAdmin ? "Update ownership, assignment and depreciation details." : "Contact an administrator to update this asset."}</p></div>
        <fieldset disabled={!isAdmin || saving} className="grid gap-4 sm:grid-cols-2">
          <div><label className="mb-1.5 block text-sm font-medium text-muted">Asset name</label><input aria-label="Asset name" required value={form.name} onChange={(e) => updateForm("name", e.target.value)} className="input-field" /></div>
          <div><label className="mb-1.5 block text-sm font-medium text-muted">Asset category</label><input aria-label="Asset category" required value={form.assetCategory} onChange={(e) => updateForm("assetCategory", e.target.value)} className="input-field" /></div>
          <div><label className="mb-1.5 block text-sm font-medium text-muted">Make</label><input aria-label="Asset make" value={form.make} onChange={(e) => updateForm("make", e.target.value)} className="input-field" /></div>
          <div><label className="mb-1.5 block text-sm font-medium text-muted">Model</label><input aria-label="Asset model" value={form.assetModel} onChange={(e) => updateForm("assetModel", e.target.value)} className="input-field" /></div>
          <div><label className="mb-1.5 block text-sm font-medium text-muted">Serial number</label><input aria-label="Asset serial number" value={form.serialNumber} onChange={(e) => updateForm("serialNumber", e.target.value)} className="input-field font-mono" /></div>
          <div><label className="mb-1.5 block text-sm font-medium text-muted">Status</label><select aria-label="Asset status" disabled={!isAdmin || TERMINAL_STATUSES.has(asset.status)} value={form.status} onChange={(e) => updateStatus(e.target.value)} className="input-field disabled:opacity-60">{STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          <div><label className="mb-1.5 block text-sm font-medium text-muted">Assigned to</label>{isAdmin ? <select aria-label="Asset assignee" value={form.assignedTo} onChange={(e) => updateForm("assignedTo", e.target.value)} className="input-field"><option value="">Unassigned</option>{users.map((user) => <option key={user._id} value={user._id}>{user.name} ({user.email})</option>)}</select> : <input aria-label="Asset assignee" value={asset.assignedTo?.name || "Unassigned"} readOnly className="input-field" />}</div>
          <div><label className="mb-1.5 block text-sm font-medium text-muted">Department</label>{isAdmin ? <select aria-label="Asset department" required value={form.department} onChange={(e) => updateForm("department", e.target.value)} className="input-field">{departments.map((department) => <option key={department._id} value={department._id}>{department.name}</option>)}</select> : <input aria-label="Asset department" value={asset.department?.name || ""} readOnly className="input-field" />}</div>
          <div><label className="mb-1.5 block text-sm font-medium text-muted">Purpose</label><input aria-label="Asset purpose" value={form.purpose} onChange={(e) => updateForm("purpose", e.target.value)} className="input-field" /></div>
          <div><label className="mb-1.5 block text-sm font-medium text-muted">Location</label><input aria-label="Asset location" value={form.location} onChange={(e) => updateForm("location", e.target.value)} className="input-field" /></div>
          {asset.canViewFinancials && <>
            <div><label className="mb-1.5 block text-sm font-medium text-muted">Depreciation method</label><select aria-label="Depreciation method" value={form.depreciationMethod} onChange={(e) => updateForm("depreciationMethod", e.target.value as EditForm["depreciationMethod"])} className="input-field"><option value="none">None</option><option value="straight_line">Straight-line</option><option value="written_down_value">Written-down value</option></select></div>
            <div><label className="mb-1.5 block text-sm font-medium text-muted">Annual rate (%)</label><input aria-label="Annual depreciation rate" type="number" min="0" max="100" step="0.01" required={form.depreciationMethod !== "none"} disabled={!isAdmin || form.depreciationMethod === "none"} value={form.depreciationRate} onChange={(e) => updateForm("depreciationRate", e.target.value)} className="input-field tabular-nums disabled:opacity-50" /></div>
            <div><label className="mb-1.5 block text-sm font-medium text-muted">Residual value ({asset.purchaseExpense.currency?.symbol || "₹"})</label><input aria-label="Residual value" type="number" min="0" step="0.01" value={form.residualValue} onChange={(e) => updateForm("residualValue", e.target.value)} className="input-field tabular-nums" /></div>
          </>}
          <div><label className="mb-1.5 block text-sm font-medium text-muted">Put-to-use date</label><input aria-label="Put-to-use date" type="date" required value={form.putToUseDate} onChange={(e) => updateForm("putToUseDate", e.target.value)} className="input-field" /></div>
          {TERMINAL_STATUSES.has(form.status) && <>
            <div><label className="mb-1.5 block text-sm font-medium text-muted">Effective lifecycle date</label><input aria-label="Effective lifecycle date" type="date" required value={form.lifecycleDate} onChange={(e) => updateForm("lifecycleDate", e.target.value)} className="input-field" /></div>
            {form.status === "sold" && <div><label className="mb-1.5 block text-sm font-medium text-muted">Sale proceeds ({asset.purchaseExpense.currency?.symbol || "₹"})</label><input aria-label="Sale proceeds" type="number" min="0" step="0.01" value={form.disposalProceeds} onChange={(e) => updateForm("disposalProceeds", e.target.value)} className="input-field tabular-nums" /></div>}
            <div className="sm:col-span-2"><label className="mb-1.5 block text-sm font-medium text-muted">Lifecycle notes</label><textarea aria-label="Lifecycle notes" rows={2} value={form.lifecycleNotes} onChange={(e) => updateForm("lifecycleNotes", e.target.value)} className="input-field resize-none" placeholder="Reason or disposal details" /></div>
          </>}
        </fieldset>
        {isAdmin && <div className="mt-6 flex flex-wrap justify-between gap-3 border-t border-line pt-5"><button type="button" onClick={reverseAsset} disabled={saving || reversing} className="btn-secondary text-red-600 hover:text-red-700">{reversing ? <><Spinner size="sm" /> Reversing...</> : "Reverse mistaken entry"}</button><button type="submit" disabled={saving || reversing} className="btn-primary">{saving ? <><Spinner size="sm" /> Saving...</> : "Save asset"}</button></div>}
      </form>

      <div className="card p-5">
        <div className="mb-4 flex items-center gap-2"><History className="h-5 w-5 text-muted-foreground" /><h2 className="font-heading text-base font-bold text-foreground">Assignment history</h2></div>
        {assignments.length === 0 ? <p className="border-t border-line pt-4 text-sm text-muted-foreground">This asset has not been assigned yet.</p> : <div className="divide-y divide-line border-t border-line">{assignments.map((assignment) => <div key={assignment._id} className="grid gap-2 py-4 text-sm sm:grid-cols-[1fr_1fr_1fr]"><div><p className="font-semibold text-foreground">{assignment.assignedTo.name}</p><p className="text-xs text-muted-foreground">{assignment.assignedTo.email}</p></div><div><p className="text-muted">{format(new Date(assignment.assignedAt), "dd MMM yyyy")}{assignment.returnedAt ? ` – ${format(new Date(assignment.returnedAt), "dd MMM yyyy")}` : " – Present"}</p><p className="text-xs text-muted-foreground">{assignment.department?.name}{assignment.location ? ` · ${assignment.location}` : ""}</p></div><div><p className="text-muted">{assignment.purpose || "No purpose recorded"}</p><p className="text-xs text-muted-foreground">Assigned by {assignment.assignedBy?.name || "Administrator"}</p></div></div>)}</div>}
      </div>

      {isAdmin && <div className="card p-5">
        <div className="mb-4 flex items-center gap-2"><History className="h-5 w-5 text-muted-foreground" /><h2 className="font-heading text-base font-bold text-foreground">Asset audit log</h2></div>
        {events.length === 0 ? <p className="border-t border-line pt-4 text-sm text-muted-foreground">No audit events recorded.</p> : <div className="divide-y divide-line border-t border-line">{events.map((event) => <div key={event._id} className="py-4 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold capitalize text-foreground">{event.type.replaceAll("_", " ")}</p><p className="text-xs text-muted-foreground">{format(new Date(event.occurredAt), "dd MMM yyyy, HH:mm")}</p></div><p className="mt-1 text-xs text-muted-foreground">By {event.actor?.name || "Administrator"}{event.reason ? ` · ${event.reason}` : ""}</p>{Object.keys(event.changes || {}).length > 0 && <p className="mt-2 text-xs text-muted">Changed: {Object.keys(event.changes).join(", ")}</p>}</div>)}</div>}
      </div>}
    </div>
  );
}
