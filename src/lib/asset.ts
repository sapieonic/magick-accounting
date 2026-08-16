export const DEPRECIATION_METHODS = [
  "none",
  "straight_line",
  "written_down_value",
] as const;

export type DepreciationMethod = (typeof DEPRECIATION_METHODS)[number];
export const MAX_ASSETS_PER_PURCHASE = 100;
const TERMINAL_ASSET_STATUSES = new Set(["retired", "sold", "lost", "disposed"]);

export function assertAssetStatusTransition(currentStatus: string, nextStatus: string): void {
  if (TERMINAL_ASSET_STATUSES.has(currentStatus) && currentStatus !== nextStatus) {
    throw new Error(
      "A terminal asset status is permanent. Reverse a mistaken entry instead of reactivating it."
    );
  }
}

export function assertLinkedExpenseCurrencyUnchanged(
  hasLinkedAssets: boolean,
  currentCurrencyId: string,
  requestedCurrencyId: string
): void {
  if (hasLinkedAssets && currentCurrencyId !== requestedCurrencyId) {
    throw new Error("Currency cannot be changed after company assets are linked");
  }
}

export interface AssetPurchaseInput {
  name: string;
  assetCategory: string;
  serialNumber?: string;
  make?: string;
  assetModel?: string;
  assignedTo?: string | null;
  purpose?: string;
  location?: string;
  allocatedAmount: number | string;
  allocatedGstAmount?: number | string | null;
  recoverableGstAmount?: number | string | null;
  depreciationMethod: DepreciationMethod;
  depreciationRate?: number | string | null;
  residualValue?: number | string | null;
  putToUseDate?: string | Date;
}

export interface NormalizedAssetPurchaseInput
  extends Omit<
    AssetPurchaseInput,
    | "allocatedAmount"
    | "allocatedGstAmount"
    | "recoverableGstAmount"
    | "depreciationRate"
    | "residualValue"
    | "putToUseDate"
  > {
  name: string;
  assetCategory: string;
  assignedTo: string | null;
  serialNumber: string;
  make: string;
  assetModel: string;
  purpose: string;
  location: string;
  allocatedAmount: number;
  allocatedGstAmount: number;
  recoverableGstAmount: number;
  capitalizedCost: number;
  depreciationRate: number;
  residualValue: number;
  putToUseDate: Date;
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function moneyToCents(value: number | string | null | undefined): number {
  const parsed = value == null || value === "" ? 0 : Number(value);
  return Number.isFinite(parsed) ? Math.round((parsed + Number.EPSILON) * 100) : 0;
}

export function resolveOptionalMoneyUpdate(
  value: unknown,
  existingValue: number | null | undefined,
  label: string
): number | null {
  if (value === undefined) return existingValue ?? null;
  if (value === "" || value === null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative number`);
  }
  return roundMoney(parsed);
}

export function getEffectiveAssetAllocation(
  persistedAssetTotal: number,
  reservedExpenseTotal: number
): number {
  return roundMoney(Math.max(0, persistedAssetTotal, reservedExpenseTotal));
}

function money(value: unknown, label: string, defaultValue = 0): number {
  if (value === "" || value == null) return defaultValue;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative number`);
  }
  return roundMoney(parsed);
}

function boundedString(value: unknown, label: string, maxLength: number): string {
  const normalized = String(value || "").trim();
  if (normalized.length > maxLength) {
    throw new Error(`${label} cannot exceed ${maxLength} characters`);
  }
  return normalized;
}

function parseDate(value: string | Date | undefined, purchaseDate: Date): Date {
  const date = value ? new Date(value) : purchaseDate;
  if (Number.isNaN(date.getTime())) {
    throw new Error("Put-to-use date is invalid");
  }
  if (date < purchaseDate) throw new Error("Put-to-use date cannot be before the purchase date");
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  if (date > endOfToday) throw new Error("Put-to-use date cannot be in the future");
  return date;
}

export function normalizeDepreciationPolicy(
  methodValue: unknown,
  rateValue: unknown,
  residualValueInput: unknown,
  capitalizedCost: number,
  prefix = "Asset"
): { method: DepreciationMethod; rate: number; residualValue: number } {
  const method = (methodValue || "none") as DepreciationMethod;
  if (!DEPRECIATION_METHODS.includes(method)) {
    throw new Error(`${prefix} depreciation method is invalid`);
  }
  const rate = money(rateValue, `${prefix} depreciation rate`);
  if (method !== "none" && (rate <= 0 || rate > 100)) {
    throw new Error(`${prefix} depreciation rate must be between 0 and 100`);
  }
  const residualValue = money(residualValueInput, `${prefix} residual value`);
  if (residualValue > capitalizedCost) {
    throw new Error(`${prefix} residual value cannot exceed its capitalized cost`);
  }
  return { method, rate: method === "none" ? 0 : rate, residualValue };
}

export function normalizeAssetPurchases(
  value: unknown,
  expenseAmount: number,
  expenseGstAmount: number | null,
  purchaseDate: Date
): NormalizedAssetPurchaseInput[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error("Assets must be an array");
  if (value.length > MAX_ASSETS_PER_PURCHASE) {
    throw new Error(`A purchase cannot create more than ${MAX_ASSETS_PER_PURCHASE} assets at once`);
  }
  if (!Number.isFinite(expenseAmount) || expenseAmount < 0) {
    throw new Error("Expense amount must be a non-negative number");
  }

  const assets = value.map((raw, index) => {
    const input = (raw || {}) as AssetPurchaseInput;
    const prefix = `Asset ${index + 1}`;
    const name = boundedString(input.name, `${prefix} name`, 200);
    const assetCategory = boundedString(input.assetCategory, `${prefix} category`, 100);
    if (!name) throw new Error(`${prefix} name is required`);
    if (!assetCategory) throw new Error(`${prefix} category is required`);

    const allocatedAmount = money(input.allocatedAmount, `${prefix} allocated amount`);
    if (allocatedAmount <= 0) throw new Error(`${prefix} allocated amount must be greater than zero`);

    const allocatedGstAmount = money(
      input.allocatedGstAmount,
      `${prefix} allocated GST`
    );
    const recoverableGstAmount = money(
      input.recoverableGstAmount,
      `${prefix} recoverable GST`
    );
    if (allocatedGstAmount > allocatedAmount) {
      throw new Error(`${prefix} allocated GST cannot exceed its allocated amount`);
    }
    if (recoverableGstAmount > allocatedGstAmount) {
      throw new Error(`${prefix} recoverable GST cannot exceed its allocated GST`);
    }

    const capitalizedCost = money(
      allocatedAmount - recoverableGstAmount,
      `${prefix} capitalized cost`
    );
    const depreciation = normalizeDepreciationPolicy(
      input.depreciationMethod,
      input.depreciationRate,
      input.residualValue,
      capitalizedCost,
      prefix
    );

    return {
      name,
      assetCategory,
      serialNumber: boundedString(input.serialNumber, `${prefix} serial number`, 200),
      make: boundedString(input.make, `${prefix} make`, 100),
      assetModel: boundedString(input.assetModel, `${prefix} model`, 100),
      assignedTo: input.assignedTo ? String(input.assignedTo) : null,
      purpose: boundedString(input.purpose, `${prefix} purpose`, 500),
      location: boundedString(input.location, `${prefix} location`, 200),
      allocatedAmount,
      allocatedGstAmount,
      recoverableGstAmount,
      capitalizedCost,
      depreciationMethod: depreciation.method,
      depreciationRate: depreciation.rate,
      residualValue: depreciation.residualValue,
      putToUseDate: parseDate(input.putToUseDate, purchaseDate),
    };
  });

  const totalAllocated = money(
    assets.reduce((total, asset) => total + asset.allocatedAmount, 0),
    "Total asset allocation"
  );
  if (totalAllocated > expenseAmount) {
    throw new Error("Total asset allocation cannot exceed the expense amount");
  }

  const totalGstAllocated = money(
    assets.reduce((total, asset) => total + asset.allocatedGstAmount, 0),
    "Total GST allocation"
  );
  if (totalGstAllocated > (expenseGstAmount || 0)) {
    throw new Error("Total asset GST allocation cannot exceed the expense GST amount");
  }

  return assets;
}

export function calculateAssetBookValue(
  capitalizedCost: number,
  residualValue: number,
  method: DepreciationMethod,
  annualRate: number,
  startDate: Date,
  asOfDate: Date
): { accumulatedDepreciation: number; bookValue: number } {
  if (method === "none" || annualRate <= 0 || asOfDate <= startDate) {
    return { accumulatedDepreciation: 0, bookValue: capitalizedCost };
  }

  const elapsedYears =
    (asOfDate.getTime() - startDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  let bookValue: number;
  if (method === "straight_line") {
    bookValue = capitalizedCost - capitalizedCost * (annualRate / 100) * elapsedYears;
  } else {
    bookValue = capitalizedCost * Math.pow(1 - annualRate / 100, elapsedYears);
  }

  bookValue = Math.max(residualValue, Math.min(capitalizedCost, bookValue));
  bookValue = roundMoney(bookValue);
  return {
    accumulatedDepreciation: roundMoney(capitalizedCost - bookValue),
    bookValue,
  };
}

export function getDepreciationAsOfDate(
  status: string,
  lifecycleDate: Date | null | undefined,
  updatedAt: Date,
  requestedAsOf: Date
): Date {
  const terminal = ["retired", "sold", "lost", "disposed"].includes(status);
  const endDate = lifecycleDate || (terminal ? updatedAt : null);
  return endDate && endDate < requestedAsOf ? endDate : requestedAsOf;
}
