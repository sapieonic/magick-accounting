"use client";

import { Copy, PackagePlus, Plus, Trash2 } from "lucide-react";

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
    onChange([
      ...assets,
      { ...asset, id: draftId(), serialNumber: "" },
    ]);
  };

  if (assets.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-brand-300 bg-brand-50/40 p-5 dark:border-brand-500/30 dark:bg-brand-500/5">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <PackagePlus className="mt-0.5 h-5 w-5 text-brand-600 dark:text-brand-400" />
            <div>
              <p className="text-sm font-semibold text-foreground">Does this purchase contain company assets?</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Add each trackable item here. The invoice, GST, currency, date and receipt stay linked
                to this expense, so you only enter the purchase once.
              </p>
            </div>
          </div>
          <button type="button" onClick={addAsset} className="btn-secondary shrink-0">
            <Plus className="h-4 w-4" /> Add company asset
          </button>
        </div>
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-brand-200 bg-brand-50/30 p-4 dark:border-brand-500/25 dark:bg-brand-500/5 sm:p-5">
      <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h2 className="font-heading text-base font-bold text-foreground">Company assets</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Allocations may cover all or only the asset portion of this expense.
          </p>
        </div>
        <button type="button" onClick={addAsset} className="btn-secondary shrink-0">
          <Plus className="h-4 w-4" /> Add another
        </button>
      </div>

      <div className="space-y-4">
        {assets.map((asset, index) => (
          <div key={asset.id} className="rounded-xl border border-line bg-surface p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">Asset {index + 1}</p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => duplicateAsset(asset)}
                  className="rounded-lg p-2 text-muted-foreground hover:bg-subtle hover:text-foreground"
                  aria-label={`Duplicate asset ${index + 1}`}
                  title="Duplicate asset"
                >
                  <Copy className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onChange(assets.filter((item) => item.id !== asset.id))}
                  className="rounded-lg p-2 text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                  aria-label={`Remove asset ${index + 1}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-muted">
                  Asset name <span className="text-red-500">*</span>
                </label>
                <input
                  aria-label={`Asset ${index + 1} name`}
                  required
                  value={asset.name}
                  onChange={(e) => updateAsset(asset.id, "name", e.target.value)}
                  placeholder="e.g. MacBook Pro 14-inch"
                  className="input-field"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-muted">
                  Asset category <span className="text-red-500">*</span>
                </label>
                <input
                  aria-label={`Asset ${index + 1} category`}
                  required
                  list="asset-category-options"
                  value={asset.assetCategory}
                  onChange={(e) => updateAsset(asset.id, "assetCategory", e.target.value)}
                  placeholder="Select or type a category"
                  className="input-field"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-muted">Make / manufacturer</label>
                <input
                  aria-label={`Asset ${index + 1} make`}
                  value={asset.make}
                  onChange={(e) => updateAsset(asset.id, "make", e.target.value)}
                  placeholder="e.g. Apple"
                  className="input-field"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-muted">Model</label>
                <input
                  aria-label={`Asset ${index + 1} model`}
                  value={asset.assetModel}
                  onChange={(e) => updateAsset(asset.id, "assetModel", e.target.value)}
                  placeholder="e.g. MacBookPro18,3"
                  className="input-field"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-muted">Serial number</label>
                <input
                  aria-label={`Asset ${index + 1} serial number`}
                  value={asset.serialNumber}
                  onChange={(e) => updateAsset(asset.id, "serialNumber", e.target.value)}
                  placeholder="Optional; add individually per asset"
                  className="input-field font-mono"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-muted">Assigned to</label>
                {canAssignOthers ? (
                  <select
                    aria-label={`Asset ${index + 1} assignee`}
                    value={asset.assignedTo}
                    onChange={(e) => updateAsset(asset.id, "assignedTo", e.target.value)}
                    className="input-field"
                  >
                    <option value="">Unassigned</option>
                    {users.map((user) => (
                      <option key={user._id} value={user._id}>{user.name} ({user.email})</option>
                    ))}
                  </select>
                ) : (
                  <input aria-label={`Asset ${index + 1} assignee`} readOnly value={currentUser?.name || "You"} className="input-field bg-subtle" />
                )}
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-muted">Purpose</label>
                <input
                  aria-label={`Asset ${index + 1} purpose`}
                  value={asset.purpose}
                  onChange={(e) => updateAsset(asset.id, "purpose", e.target.value)}
                  placeholder="e.g. Design and development work"
                  className="input-field"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-muted">Location</label>
                <input
                  aria-label={`Asset ${index + 1} location`}
                  value={asset.location}
                  onChange={(e) => updateAsset(asset.id, "location", e.target.value)}
                  placeholder="e.g. Mumbai office"
                  className="input-field"
                />
              </div>
            </div>

            <div className="my-4 border-t border-line" />

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-muted">
                  Allocated amount ({currencySymbol}) <span className="text-red-500">*</span>
                </label>
                <input
                  aria-label={`Asset ${index + 1} allocated amount`}
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={asset.allocatedAmount}
                  onChange={(e) => updateAsset(asset.id, "allocatedAmount", e.target.value)}
                  className="input-field tabular-nums"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-muted">GST allocation ({currencySymbol})</label>
                <input
                  aria-label={`Asset ${index + 1} GST allocation`}
                  type="number"
                  min="0"
                  step="0.01"
                  value={asset.allocatedGstAmount}
                  onChange={(e) => updateAsset(asset.id, "allocatedGstAmount", e.target.value)}
                  className="input-field tabular-nums"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-muted">Recoverable GST ({currencySymbol})</label>
                <input
                  aria-label={`Asset ${index + 1} recoverable GST`}
                  type="number"
                  min="0"
                  step="0.01"
                  value={asset.recoverableGstAmount}
                  onChange={(e) => updateAsset(asset.id, "recoverableGstAmount", e.target.value)}
                  className="input-field tabular-nums"
                />
              </div>
            </div>

            <div className="mt-3 rounded-lg bg-subtle px-3 py-2 text-xs text-muted-foreground">
              Capitalized cost: <span className="font-semibold text-foreground">{currencySymbol}{capitalizedCost(asset).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
              <span className="ml-1">(allocated amount minus recoverable GST)</span>
            </div>

            <div className="my-4 border-t border-line" />

            <div className="grid gap-4 sm:grid-cols-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-muted">Depreciation</label>
                <select
                  aria-label={`Asset ${index + 1} depreciation method`}
                  value={asset.depreciationMethod}
                  onChange={(e) => updateAsset(asset.id, "depreciationMethod", e.target.value)}
                  className="input-field"
                >
                  <option value="none">None</option>
                  <option value="straight_line">Straight-line</option>
                  <option value="written_down_value">Written-down value</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-muted">Annual rate (%)</label>
                <input
                  aria-label={`Asset ${index + 1} annual depreciation rate`}
                  type="number"
                  required={asset.depreciationMethod !== "none"}
                  disabled={asset.depreciationMethod === "none"}
                  min="0.01"
                  max="100"
                  step="0.01"
                  value={asset.depreciationRate}
                  onChange={(e) => updateAsset(asset.id, "depreciationRate", e.target.value)}
                  className="input-field tabular-nums disabled:opacity-50"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-muted">Residual value ({currencySymbol})</label>
                <input
                  aria-label={`Asset ${index + 1} residual value`}
                  type="number"
                  min="0"
                  step="0.01"
                  value={asset.residualValue}
                  onChange={(e) => updateAsset(asset.id, "residualValue", e.target.value)}
                  className="input-field tabular-nums"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-muted">Put to use</label>
                <input
                  aria-label={`Asset ${index + 1} put-to-use date`}
                  required
                  type="date"
                  value={asset.putToUseDate}
                  onChange={(e) => updateAsset(asset.id, "putToUseDate", e.target.value)}
                  className="input-field"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <datalist id="asset-category-options">
        {ASSET_CATEGORIES.map((category) => <option key={category} value={category} />)}
      </datalist>
    </section>
  );
}
