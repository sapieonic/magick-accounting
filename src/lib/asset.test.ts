import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  calculateAssetBookValue,
  assertAssetStatusTransition,
  assertLinkedExpenseCurrencyUnchanged,
  getDepreciationAsOfDate,
  getEffectiveAssetAllocation,
  MAX_ASSETS_PER_PURCHASE,
  normalizeAssetPurchases,
  normalizeDepreciationPolicy,
} from "@/lib/asset";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-16T12:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("normalizeAssetPurchases", () => {
  const purchaseDate = new Date("2026-04-01T00:00:00.000Z");

  it("normalizes an asset and removes recoverable GST from capitalized cost", () => {
    const [asset] = normalizeAssetPurchases(
      [
        {
          name: "Developer laptop",
          assetCategory: "Computer & Laptop",
          allocatedAmount: "118000",
          allocatedGstAmount: "18000",
          recoverableGstAmount: "18000",
          depreciationMethod: "straight_line",
          depreciationRate: "20",
        },
      ],
      118000,
      18000,
      purchaseDate
    );

    expect(asset.capitalizedCost).toBe(100000);
    expect(asset.putToUseDate).toEqual(purchaseDate);
    expect(asset.depreciationRate).toBe(20);
  });

  it("allows an expense to contain both assets and non-asset items", () => {
    const assets = normalizeAssetPurchases(
      [
        {
          name: "Monitor",
          assetCategory: "Office Equipment",
          allocatedAmount: 30000,
          depreciationMethod: "none",
        },
      ],
      50000,
      null,
      purchaseDate
    );

    expect(assets).toHaveLength(1);
    expect(assets[0].capitalizedCost).toBe(30000);
  });

  it("rejects asset allocations above the linked expense", () => {
    expect(() =>
      normalizeAssetPurchases(
        [
          {
            name: "Laptop",
            assetCategory: "Computer & Laptop",
            allocatedAmount: 60000,
            depreciationMethod: "none",
          },
          {
            name: "Monitor",
            assetCategory: "Office Equipment",
            allocatedAmount: 50000,
            depreciationMethod: "none",
          },
        ],
        100000,
        null,
        purchaseDate
      )
    ).toThrow(/cannot exceed the expense amount/i);
  });

  it("rejects recoverable GST above the GST allocated to the asset", () => {
    expect(() =>
      normalizeAssetPurchases(
        [
          {
            name: "Laptop",
            assetCategory: "Computer & Laptop",
            allocatedAmount: 118000,
            allocatedGstAmount: 10000,
            recoverableGstAmount: 18000,
            depreciationMethod: "none",
          },
        ],
        118000,
        18000,
        purchaseDate
      )
    ).toThrow(/recoverable GST cannot exceed/i);
  });

  it("rejects put-to-use dates before purchase or in the future", () => {
    const base = {
      name: "Laptop",
      assetCategory: "Computer & Laptop",
      allocatedAmount: 1000,
      depreciationMethod: "none" as const,
    };
    expect(() =>
      normalizeAssetPurchases(
        [{ ...base, putToUseDate: "2026-03-31" }],
        1000,
        null,
        purchaseDate
      )
    ).toThrow(/before the purchase date/i);
    expect(() =>
      normalizeAssetPurchases(
        [{ ...base, putToUseDate: "2026-08-17" }],
        1000,
        null,
        purchaseDate
      )
    ).toThrow(/in the future/i);
  });

  it("limits the number of assets created in one request", () => {
    const assets = Array.from({ length: MAX_ASSETS_PER_PURCHASE + 1 }, (_, index) => ({
      name: `Asset ${index}`,
      assetCategory: "Other",
      allocatedAmount: 1,
      depreciationMethod: "none" as const,
    }));
    expect(() => normalizeAssetPurchases(assets, 1000, null, purchaseDate)).toThrow(
      /cannot create more than/i
    );
  });
});

describe("normalizeDepreciationPolicy", () => {
  it("rejects a zero rate for a depreciating method on updates", () => {
    expect(() => normalizeDepreciationPolicy("straight_line", 0, 0, 1000)).toThrow(
      /between 0 and 100/i
    );
  });

  it("normalizes no-depreciation policies to a zero rate", () => {
    expect(normalizeDepreciationPolicy("none", 25, 100, 1000)).toEqual({
      method: "none",
      rate: 0,
      residualValue: 100,
    });
  });
});

describe("calculateAssetBookValue", () => {
  const start = new Date("2025-01-01T00:00:00.000Z");
  const oneYearLater = new Date("2026-01-01T06:00:00.000Z");

  it("calculates straight-line depreciation with a residual-value floor", () => {
    const firstYear = calculateAssetBookValue(
      100000,
      10000,
      "straight_line",
      20,
      start,
      oneYearLater
    );
    expect(firstYear.bookValue).toBeCloseTo(80000, -1);

    const fullyDepreciated = calculateAssetBookValue(
      100000,
      10000,
      "straight_line",
      20,
      start,
      new Date("2035-01-01T00:00:00.000Z")
    );
    expect(fullyDepreciated.bookValue).toBe(10000);
  });

  it("calculates written-down value depreciation", () => {
    const result = calculateAssetBookValue(
      100000,
      0,
      "written_down_value",
      20,
      start,
      oneYearLater
    );
    expect(result.bookValue).toBeCloseTo(80000, -1);
    expect(result.accumulatedDepreciation).toBeCloseTo(20000, -1);
  });
});

describe("getDepreciationAsOfDate", () => {
  it("freezes terminal assets on their effective lifecycle date", () => {
    const lifecycleDate = new Date("2026-06-30T00:00:00.000Z");
    expect(
      getDepreciationAsOfDate(
        "sold",
        lifecycleDate,
        new Date("2026-07-01T00:00:00.000Z"),
        new Date("2026-12-31T00:00:00.000Z")
      )
    ).toEqual(lifecycleDate);
  });

  it("uses updatedAt as a safe cutoff for legacy terminal assets", () => {
    const updatedAt = new Date("2026-05-15T12:00:00.000Z");
    expect(
      getDepreciationAsOfDate(
        "retired",
        null,
        updatedAt,
        new Date("2026-12-31T00:00:00.000Z")
      )
    ).toEqual(updatedAt);
  });
});

describe("assertLinkedExpenseCurrencyUnchanged", () => {
  it("blocks currency reinterpretation once assets are linked", () => {
    expect(() => assertLinkedExpenseCurrencyUnchanged(true, "inr-id", "usd-id")).toThrow(
      /cannot be changed/i
    );
  });

  it("allows currency corrections before any assets are linked", () => {
    expect(() =>
      assertLinkedExpenseCurrencyUnchanged(false, "inr-id", "usd-id")
    ).not.toThrow();
  });
});

describe("assertAssetStatusTransition", () => {
  it("allows normal operational status changes", () => {
    expect(() => assertAssetStatusTransition("active", "under_repair")).not.toThrow();
    expect(() => assertAssetStatusTransition("under_repair", "active")).not.toThrow();
  });

  it("makes terminal lifecycle states irreversible", () => {
    expect(() => assertAssetStatusTransition("sold", "active")).toThrow(/permanent/i);
    expect(() => assertAssetStatusTransition("disposed", "retired")).toThrow(/permanent/i);
    expect(() => assertAssetStatusTransition("retired", "retired")).not.toThrow();
  });
});

describe("getEffectiveAssetAllocation", () => {
  it("honors an in-flight reservation before asset documents are visible", () => {
    expect(getEffectiveAssetAllocation(0, 750)).toBe(750);
  });

  it("uses persisted assets to self-heal a stale legacy counter", () => {
    expect(getEffectiveAssetAllocation(1200.005, 1000)).toBe(1200.01);
  });
});
