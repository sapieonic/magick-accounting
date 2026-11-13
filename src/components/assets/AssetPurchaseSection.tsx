"use client";

import { Copy, PackagePlus, Plus, Trash2 } from "lucide-react";
import Button, { IconButton } from "@/components/ui/Button";
import Field, { inputClass, selectClass } from "@/components/ui/Field";
import { FieldGrid } from "@/components/ui/FormSection";
import { cn } from "@/components/ui/cn";
import AssetFieldGroup from "@/components/assets/AssetFieldGroup";

export interface AssetDraft {
  id: string;
  name: string;
  assetCategory: string;
  serialNumber: string;
  make: string;
  assetModel: string;
  assignedTo: string;
  purpose: string;
  location: string;
  allocatedAmount: string;
  allocatedGstAmount: string;
  recoverableGstAmount: string;
  depreciationMethod: "none" | "straight_line" | "written_down_value";
  depreciationRate: string;
  residualValue: string;
  putToUseDate: string;
}

interface UserOption {
  _id: string;
  name: string;
  email: string;
}

interface AssetPurchaseSectionProps {
  assets: AssetDraft[];
  onChange: (assets: AssetDraft[]) => void;
  purchaseDate: string;
  currencySymbol: string;
  users: UserOption[];
  canAssignOthers: boolean;
  currentUser?: UserOption | null;
}

const ASSET_CATEGORIES = [
  "Computer & Laptop",
  "Mobile Device",
  "Office Equipment",
  "Furniture & Fixtures",
  "Audio & Video Equipment",
  "Vehicle",
  "Plant & Machinery",
  "Other",
];

function draftId(): string {
  return `asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createEmptyAsset(purchaseDate: string, assignedTo = ""): AssetDraft {
  return {
    id: draftId(),
    name: "",
    assetCategory: "",
    serialNumber: "",
    make: "",
    assetModel: "",
    assignedTo,
    purpose: "",
    location: "",
    allocatedAmount: "",
    allocatedGstAmount: "",
    recoverableGstAmount: "",
    depreciationMethod: "straight_line",
    depreciationRate: "",
    residualValue: "0",
    putToUseDate: purchaseDate,
  };
}

function capitalizedCost(asset: AssetDraft): number {
  return Math.max(
    0,
    (Number(asset.allocatedAmount) || 0) - (Number(asset.recoverableGstAmount) || 0)
  );
}


export default function AssetPurchaseSection({
  assets,
  onChange,
  purchaseDate,
  currencySymbol,
  users,
  canAssignOthers,
  currentUser,
}: AssetPurchaseSectionProps) {
  const updateAsset = (id: string, field: keyof AssetDraft, value: string) => {
    onChange(assets.map((asset) => (asset.id === id ? { ...asset, [field]: value } : asset)));
  };

  const addAsset = () => {
    onChange([...assets, createEmptyAsset(purchaseDate, currentUser?._id || "")]);
  };

  const duplicateAsset = (asset: AssetDraft) => {
    onChange([...assets, { ...asset, id: draftId(), serialNumber: "" }]);
  };

  if (assets.length === 0) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-panel border border-dashed border-accent-line bg-tint p-4">
        <div className="flex min-w-0 flex-1 basis-[280px] items-start gap-3">
          <PackagePlus aria-hidden="true" size={20} strokeWidth={1.5} className="mt-0.5 shrink-0 text-accent" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-ink">Does this purchase contain company assets?</p>
            <p className="text-[13px] text-ink-3 [text-wrap:pretty]">
              Add each trackable item here. The invoice, GST, currency, date and receipt stay linked to this
              expense, so you only enter the purchase once.
            </p>
          </div>
        </div>
        <Button variant="secondary" icon={Plus} onClick={addAsset}>
          Add company asset
        </Button>
      </div>
    );
  }

  const money = `(${currencySymbol})`;

  return (
    <section aria-labelledby="company-assets-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="company-assets-heading" className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
            Company assets
          </h2>
          <p className="text-[13px] text-ink-3">
            Allocations may cover all or only the asset portion of this expense.
          </p>
        </div>
        <Button variant="secondary" size="sm" icon={Plus} onClick={addAsset}>
          Add another
        </Button>
      </div>

      {assets.map((asset, index) => {
        const n = index + 1;
        const headingId = `${asset.id}-heading`;
        // The card is a group named "Asset n", so each control keeps its visible label as its name.
        return (
          <div
            key={asset.id}
            role="group"
            aria-labelledby={headingId}
            className="flex flex-col gap-4 rounded-panel border border-rule p-[clamp(14px,2vw,20px)]"
          >
            <div className="flex items-center justify-between gap-2">
              <p id={headingId} className="text-sm font-semibold text-ink">
                Asset {n}
              </p>
              <div className="flex items-center gap-1">
                <IconButton icon={Copy} size="sm" onClick={() => duplicateAsset(asset)} aria-label={`Duplicate asset ${n}`} />
                <IconButton
                  icon={Trash2}
                  variant="ghost-danger"
                  size="sm"
                  onClick={() => onChange(assets.filter((item) => item.id !== asset.id))}
                  aria-label={`Remove asset ${n}`}
                />
              </div>
            </div>

            <FieldGrid>
              <Field label="Asset name">
                <input
                  required
                  value={asset.name}
                  onChange={(e) => updateAsset(asset.id, "name", e.target.value)}
                  placeholder="e.g. MacBook Pro 14-inch"
                  className={inputClass}
                />
              </Field>
              <Field label="Asset category">
                <input
                  required
                  list="asset-category-options"
                  value={asset.assetCategory}
                  onChange={(e) => updateAsset(asset.id, "assetCategory", e.target.value)}
                  placeholder="Select or type a category"
                  className={inputClass}
                />
              </Field>
              <Field label="Make / manufacturer" optional>
                <input
                  value={asset.make}
                  onChange={(e) => updateAsset(asset.id, "make", e.target.value)}
                  placeholder="e.g. Apple"
                  className={inputClass}
                />
              </Field>
              <Field label="Model" optional>
                <input
                  value={asset.assetModel}
                  onChange={(e) => updateAsset(asset.id, "assetModel", e.target.value)}
                  placeholder="e.g. MacBookPro18,3"
                  className={inputClass}
                />
              </Field>
              <Field label="Serial number" optional>
                <input
                  value={asset.serialNumber}
                  onChange={(e) => updateAsset(asset.id, "serialNumber", e.target.value)}
                  placeholder="Add individually per asset"
                  className={cn(inputClass, "num")}
                />
              </Field>
              <Field label="Assigned to">
                {canAssignOthers ? (
                  <select
                    value={asset.assignedTo}
                    onChange={(e) => updateAsset(asset.id, "assignedTo", e.target.value)}
                    className={selectClass}
                  >
                    <option value="">Unassigned</option>
                    {users.map((user) => (
                      <option key={user._id} value={user._id}>
                        {user.name} ({user.email})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    readOnly
                    value={currentUser?.name || "You"}
                    className={cn(inputClass, "read-only:bg-sunk")}
                  />
                )}
              </Field>
              <Field label="Purpose" optional>
                <input
                  value={asset.purpose}
                  onChange={(e) => updateAsset(asset.id, "purpose", e.target.value)}
                  placeholder="e.g. Design and development work"
                  className={inputClass}
                />
              </Field>
              <Field label="Location" optional>
                <input
                  value={asset.location}
                  onChange={(e) => updateAsset(asset.id, "location", e.target.value)}
                  placeholder="e.g. Mumbai office"
                  className={inputClass}
                />
              </Field>
            </FieldGrid>

            <AssetFieldGroup title="Cost">
              <FieldGrid min={160}>
                <Field label={`Allocated amount ${money}`}>
                  <input
                    required
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={asset.allocatedAmount}
                    onChange={(e) => updateAsset(asset.id, "allocatedAmount", e.target.value)}
                    className={cn(inputClass, "num text-right")}
                  />
                </Field>
                <Field label={`GST allocation ${money}`} optional>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={asset.allocatedGstAmount}
                    onChange={(e) => updateAsset(asset.id, "allocatedGstAmount", e.target.value)}
                    className={cn(inputClass, "num text-right")}
                  />
                </Field>
                <Field label={`Recoverable GST ${money}`} optional>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={asset.recoverableGstAmount}
                    onChange={(e) => updateAsset(asset.id, "recoverableGstAmount", e.target.value)}
                    className={cn(inputClass, "num text-right")}
                  />
                </Field>
              </FieldGrid>
              <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-control bg-sunk px-3 py-2 text-xs text-ink-3">
                <span>
                  Capitalized cost{" "}
                  <span className="num text-[13px] font-medium text-ink">
                    {currencySymbol}
                    {capitalizedCost(asset).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                  </span>
                </span>
                <span>allocated amount minus recoverable GST</span>
              </p>
            </AssetFieldGroup>

            <AssetFieldGroup title="Depreciation">
              <FieldGrid min={160}>
                <Field label="Method">
                  <select
                    value={asset.depreciationMethod}
                    onChange={(e) => updateAsset(asset.id, "depreciationMethod", e.target.value)}
                    className={selectClass}
                  >
                    <option value="none">None</option>
                    <option value="straight_line">Straight-line</option>
                    <option value="written_down_value">Written-down value</option>
                  </select>
                </Field>
                <Field label="Annual rate (%)">
                  <input
                    type="number"
                    required={asset.depreciationMethod !== "none"}
                    disabled={asset.depreciationMethod === "none"}
                    min="0.01"
                    max="100"
                    step="0.01"
                    value={asset.depreciationRate}
                    onChange={(e) => updateAsset(asset.id, "depreciationRate", e.target.value)}
                    className={cn(inputClass, "num text-right")}
                  />
                </Field>
                <Field label={`Residual value ${money}`}>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={asset.residualValue}
                    onChange={(e) => updateAsset(asset.id, "residualValue", e.target.value)}
                    className={cn(inputClass, "num text-right")}
                  />
                </Field>
                <Field label="Put to use">
                  <input
                    required
                    type="date"
                    value={asset.putToUseDate}
                    onChange={(e) => updateAsset(asset.id, "putToUseDate", e.target.value)}
                    className={inputClass}
                  />
                </Field>
              </FieldGrid>
            </AssetFieldGroup>
          </div>
        );
      })}

      <datalist id="asset-category-options">
        {ASSET_CATEGORIES.map((category) => (
          <option key={category} value={category} />
        ))}
      </datalist>
    </section>
  );
}
