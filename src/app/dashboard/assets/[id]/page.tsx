"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { CalendarDays, Download, ExternalLink, FileText, Layers, Paperclip, Save, Undo2 } from "lucide-react";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/currency";
import { dayKey } from "@/lib/trip";
import { useAuth } from "@/contexts/AuthContext";
import { useTitle } from "@/hooks/useTitle";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import Field, { inputClass, selectClass, textareaClass } from "@/components/ui/Field";
import PageHeader from "@/components/ui/PageHeader";
import Panel, { PanelGrid } from "@/components/ui/Panel";
import Spinner from "@/components/ui/Spinner";
import StatBand, { Stat } from "@/components/ui/StatBand";
import { FormSkeleton } from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/cn";
import { linkClass, ICON_STROKE } from "@/components/ui/styles";
import AssetStatusBadge, { ASSET_STATUSES, TERMINAL_STATUSES } from "@/components/assets/AssetStatusBadge";
import { AssetEventList, AssignmentList, type AssetAssignment, type AssetEvent } from "@/components/assets/AssetHistory";
import DetailList from "@/components/ui/DetailList";
import { useReceiptOpener } from "@/components/assets/useReceiptOpener";
import AssetFieldGroup from "@/components/assets/AssetFieldGroup";
import { FieldGrid } from "@/components/ui/FormSection";

interface UserOption { _id: string; name: string; email: string }
interface DepartmentOption { _id: string; name: string }

type DepreciationMethod = "none" | "straight_line" | "written_down_value";

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
  depreciationMethod?: DepreciationMethod;
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
  depreciationMethod: DepreciationMethod;
  depreciationRate: string;
  residualValue: string;
  putToUseDate: string;
  lifecycleDate: string;
  disposalProceeds: string;
  lifecycleNotes: string;
}

/** A date stored as UTC midnight of its day ("6 Nov 2026"), whatever the viewer's zone. */
function calendarDay(value: string): string {
  return format(parseISO(dayKey(value)), "d MMM yyyy");
}

const DEPRECIATION_LABELS: Record<DepreciationMethod, string> = {
  none: "None",
  straight_line: "Straight-line",
  written_down_value: "Written-down value",
};

export default function AssetDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const { opening, openReceipt } = useReceiptOpener();
  const [asset, setAsset] = useState<AssetDetail | null>(null);
  const [assignments, setAssignments] = useState<AssetAssignment[]>([]);
  const [events, setEvents] = useState<AssetEvent[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [form, setForm] = useState<EditForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
        const assetData = results[0] as { asset: AssetDetail; assignments: AssetAssignment[]; events: AssetEvent[] };
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

  if (loading || !asset || !form) return <FormSkeleton />;
  const purchase = asset.purchaseExpense;
  const currencyCode = purchase.currency?.code || "INR";
  const currencySymbol = purchase.currency?.symbol || "₹";
  const money = (value: number) => formatCurrency(value, currencyCode);
  const showValuation =
    asset.canViewFinancials &&
    asset.capitalizedCost != null &&
    asset.accumulatedDepreciation != null &&
    asset.bookValue != null;
  const method = asset.depreciationMethod || "none";
  const depreciationSummary =
    method === "none" ? "Not depreciated" : `${DEPRECIATION_LABELS[method]} · ${asset.depreciationRate ?? 0}% a year`;
  const depreciatedShare =
    showValuation && asset.capitalizedCost! > 0
      ? Math.round((asset.accumulatedDepreciation! / asset.capitalizedCost!) * 1000) / 10
      : 0;

  return (
    <div className="animate-fade-in flex flex-col gap-6">
      <PageHeader
        breadcrumb={[{ label: "Assets", href: "/dashboard/assets" }, { label: asset.name }]}
        title={asset.name}
        meta={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="num font-medium text-accent">{asset.assetTag}</span>
            <span aria-hidden="true">·</span>
            <span>{asset.assetCategory}</span>
            {asset.department?.name && (
              <>
                <span aria-hidden="true">·</span>
                <span>{asset.department.name}</span>
              </>
            )}
            <AssetStatusBadge status={asset.status} className="ml-1" />
          </span>
        }
      />

      {showValuation && (
        <StatBand aria-label="Valuation">
          <Stat headline label="Current book value" value={money(asset.bookValue!)} sub={depreciationSummary} />
          <Stat
            label="Capitalized cost"
            value={money(asset.capitalizedCost!)}
            sub={`Put to use ${calendarDay(asset.putToUseDate)}`}
          />
          <Stat
            label="Accumulated depreciation"
            value={money(asset.accumulatedDepreciation!)}
            sub={`${depreciatedShare}% of cost`}
          />
        </StatBand>
      )}

      <PanelGrid min={400}>
        <Panel
          grow={3}
          title="Purchase record"
          actions={
            asset.canViewFinancials && (
              <Link
                href={`/dashboard/expenses/${purchase._id}/edit`}
                className={cn(linkClass, "inline-flex items-center gap-1 text-[13px]")}
              >
                View expense <ExternalLink aria-hidden="true" size={13} strokeWidth={ICON_STROKE} />
              </Link>
            )
          }
        >
          <p className="mb-2 text-xs text-ink-3">
            {asset.canViewFinancials
              ? "Financial values come from the linked expense and are not entered again."
              : "Purchase financials and receipt are visible only to the expense owner and administrators."}
          </p>
          <DetailList
            items={[
              { label: "Expense", icon: FileText, value: <span className="font-medium">{purchase.title}</span> },
              {
                label: "Purchase date",
                icon: CalendarDays,
                value: <span className="num">{calendarDay(purchase.date)}</span>,
              },
              {
                label: "Asset allocation",
                icon: Layers,
                value:
                  asset.canViewFinancials && asset.allocatedAmount != null && asset.allocatedGstAmount != null ? (
                    <span className="flex flex-col items-end">
                      <span className="num font-medium">{money(asset.allocatedAmount)}</span>
                      <span className="num text-xs text-ink-3">GST {money(asset.allocatedGstAmount)}</span>
                    </span>
                  ) : (
                    <span className="text-ink-3">Restricted</span>
                  ),
              },
              {
                label: "Receipt",
                icon: Paperclip,
                value: purchase.receiptKey ? (
                  <button
                    type="button"
                    onClick={() => openReceipt(asset._id, purchase.receiptKey)}
                    disabled={opening !== null}
                    className={cn(linkClass, "inline-flex min-h-[40px] max-w-full items-center gap-1.5 text-left")}
                  >
                    {opening ? <Spinner size="sm" /> : <Download aria-hidden="true" size={15} strokeWidth={ICON_STROKE} />}
                    <span className="ell">{purchase.receiptFilename || "Open receipt"}</span>
                  </button>
                ) : (
                  <span className="text-ink-3">No receipt</span>
                ),
              },
            ]}
          />
        </Panel>
        <Panel grow={2} flush title="Assignment history" meta={asset.assignedTo ? `With ${asset.assignedTo.name}` : "Unassigned"}>
          <AssignmentList assignments={assignments} />
        </Panel>
      </PanelGrid>

      <PanelGrid min={440}>
        <Panel
          grow={2}
          title="Asset details"
          description={
            isAdmin ? "Update ownership, assignment and depreciation details." : "Contact an administrator to update this asset."
          }
        >
          <form onSubmit={save} className="flex flex-col gap-5">
            <fieldset disabled={!isAdmin || saving} className="flex min-w-0 flex-col gap-5">
              <AssetFieldGroup title="Identity">
                <FieldGrid min={220}>
                  <Field label="Asset name">
                    <input required value={form.name} onChange={(e) => updateForm("name", e.target.value)} className={inputClass} />
                  </Field>
                  <Field label="Asset category">
                    <input required value={form.assetCategory} onChange={(e) => updateForm("assetCategory", e.target.value)} className={inputClass} />
                  </Field>
                  <Field label="Make">
                    <input value={form.make} onChange={(e) => updateForm("make", e.target.value)} className={inputClass} />
                  </Field>
                  <Field label="Model">
                    <input value={form.assetModel} onChange={(e) => updateForm("assetModel", e.target.value)} className={inputClass} />
                  </Field>
                  <Field label="Serial number">
                    <input value={form.serialNumber} onChange={(e) => updateForm("serialNumber", e.target.value)} className={cn(inputClass, "num")} />
                  </Field>
                </FieldGrid>
              </AssetFieldGroup>

              <AssetFieldGroup title="Assignment">
                <FieldGrid min={220}>
                  <Field label="Assigned to">
                    {isAdmin ? (
                      <select value={form.assignedTo} onChange={(e) => updateForm("assignedTo", e.target.value)} className={selectClass}>
                        <option value="">Unassigned</option>
                        {users.map((user) => (
                          <option key={user._id} value={user._id}>
                            {user.name} ({user.email})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input value={asset.assignedTo?.name || "Unassigned"} readOnly className={inputClass} />
                    )}
                  </Field>
                  <Field label="Department">
                    {isAdmin ? (
                      <select required value={form.department} onChange={(e) => updateForm("department", e.target.value)} className={selectClass}>
                        {departments.map((department) => (
                          <option key={department._id} value={department._id}>
                            {department.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input value={asset.department?.name || ""} readOnly className={inputClass} />
                    )}
                  </Field>
                  <Field label="Purpose">
                    <input value={form.purpose} onChange={(e) => updateForm("purpose", e.target.value)} className={inputClass} />
                  </Field>
                  <Field label="Location">
                    <input value={form.location} onChange={(e) => updateForm("location", e.target.value)} className={inputClass} />
                  </Field>
                </FieldGrid>
              </AssetFieldGroup>

              {asset.canViewFinancials && (
                <AssetFieldGroup title="Depreciation">
                  <FieldGrid min={220}>
                    <Field label="Depreciation method">
                      <select
                        value={form.depreciationMethod}
                        onChange={(e) => updateForm("depreciationMethod", e.target.value as DepreciationMethod)}
                        className={selectClass}
                      >
                        {(Object.keys(DEPRECIATION_LABELS) as DepreciationMethod[]).map((value) => (
                          <option key={value} value={value}>
                            {DEPRECIATION_LABELS[value]}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Annual rate (%)">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        inputMode="decimal"
                        required={form.depreciationMethod !== "none"}
                        disabled={!isAdmin || form.depreciationMethod === "none"}
                        value={form.depreciationRate}
                        onChange={(e) => updateForm("depreciationRate", e.target.value)}
                        className={cn(inputClass, "num text-right")}
                      />
                    </Field>
                    <Field label={`Residual value (${currencySymbol})`}>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        value={form.residualValue}
                        onChange={(e) => updateForm("residualValue", e.target.value)}
                        className={cn(inputClass, "num text-right")}
                      />
                    </Field>
                  </FieldGrid>
                </AssetFieldGroup>
              )}

              <AssetFieldGroup title="Status & lifecycle">
                <FieldGrid min={220}>
                  <Field label="Status">
                    <select
                      disabled={!isAdmin || TERMINAL_STATUSES.has(asset.status)}
                      value={form.status}
                      onChange={(e) => updateStatus(e.target.value)}
                      className={selectClass}
                    >
                      {ASSET_STATUSES.map(({ value, label }) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Put-to-use date">
                    <input type="date" required value={form.putToUseDate} onChange={(e) => updateForm("putToUseDate", e.target.value)} className={inputClass} />
                  </Field>
                  {TERMINAL_STATUSES.has(form.status) && (
                    <>
                      <Field label="Effective lifecycle date">
                        <input type="date" required value={form.lifecycleDate} onChange={(e) => updateForm("lifecycleDate", e.target.value)} className={inputClass} />
                      </Field>
                      {form.status === "sold" && (
                        <Field label={`Sale proceeds (${currencySymbol})`}>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            value={form.disposalProceeds}
                            onChange={(e) => updateForm("disposalProceeds", e.target.value)}
                            className={cn(inputClass, "num text-right")}
                          />
                        </Field>
                      )}
                      <Field label="Lifecycle notes" className="col-span-full">
                        <textarea
                          rows={2}
                          value={form.lifecycleNotes}
                          onChange={(e) => updateForm("lifecycleNotes", e.target.value)}
                          className={cn(textareaClass, "resize-none")}
                          placeholder="Reason or disposal details"
                        />
                      </Field>
                    </>
                  )}
                </FieldGrid>
              </AssetFieldGroup>
            </fieldset>

            {isAdmin && (
              <div className="flex flex-wrap justify-between gap-3 border-t border-rule pt-5">
                <Button variant="danger" icon={Undo2} onClick={reverseAsset} disabled={saving} loading={reversing}>
                  {reversing ? "Reversing..." : "Reverse mistaken entry"}
                </Button>
                <Button type="submit" icon={Save} disabled={reversing} loading={saving}>
                  {saving ? "Saving..." : "Save asset"}
                </Button>
              </div>
            )}
          </form>
        </Panel>

        {isAdmin && (
          <Panel flush title="Audit log" meta={`${events.length} ${events.length === 1 ? "event" : "events"}`}>
            <AssetEventList events={events} />
          </Panel>
        )}
      </PanelGrid>
    </div>
  );
}
