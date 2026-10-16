import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Aggregator } from "mingo";
import "mingo/init/system";
import { NextRequest, NextResponse } from "next/server";
import { GET } from "./route";
import { verifyAuth } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Expense from "@/models/Expense";
import { companyBaseExpr, pocketBaseExpr } from "@/lib/expense";

vi.mock("@/lib/auth", () => ({
  verifyAuth: vi.fn(),
}));

vi.mock("@/lib/mongodb", () => ({
  connectDB: vi.fn(),
}));

vi.mock("@/models/Expense", () => ({
  default: {
    aggregate: vi.fn(),
  },
}));

vi.mock("@/models/Category", () => ({ default: {} }));
vi.mock("@/models/Department", () => ({ default: {} }));

// Mock NextResponse
vi.mock("next/server", () => {
  class MockNextResponse {
    static json = vi.fn((data, init) => ({ data, init }));
  }
  return {
    NextResponse: MockNextResponse,
  };
});

describe("GET /api/dashboard/charts", () => {
  const mockReq = { url: "http://localhost/api/dashboard/charts" } as NextRequest;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should return auth error if verifyAuth fails", async () => {
    const errorResponse = new NextResponse();
    vi.mocked(verifyAuth).mockResolvedValueOnce(errorResponse as any);

    const result = await GET(mockReq);
    expect(result).toBe(errorResponse);
  });

  it("should aggregate and return all chart data including new paymentSources and departmentSpend", async () => {
    vi.mocked(verifyAuth).mockResolvedValueOnce({ uid: "user-123", role: "admin" } as any);
    
    // Mock the 4 aggregation results in order: trendRows, categoryRows, paymentSourceRows, departmentSpendRows
    vi.mocked(Expense.aggregate)
      .mockResolvedValueOnce([{ _id: { y: 2026, m: 6 }, total: 1000, count: 5 }]) // trend
      .mockResolvedValueOnce([{ _id: "cat1", name: "Software", total: 800, count: 3 }]) // categories
      .mockResolvedValueOnce([ // payment sources
        { _id: null, pocketTotal: 400, pocketCount: 3, companyTotal: 600, companyCount: 2 },
      ])
      .mockResolvedValueOnce([ // departments
        { _id: "dep1", name: "Engineering", total: 1000, count: 5 }
      ]);

    const result = await GET(mockReq);

    expect(connectDB).toHaveBeenCalled();
    expect(Expense.aggregate).toHaveBeenCalledTimes(4);

    expect(NextResponse.json).toHaveBeenCalled();
    const responseData = (result as any).data;
    
    expect(responseData.monthlyTrend).toBeDefined();
    expect(responseData.topCategories).toEqual([{ _id: "cat1", name: "Software", total: 800, count: 3 }]);
    expect(responseData.paymentSources).toEqual([
      { name: "company", total: 600, count: 2 },
      { name: "pocket", total: 400, count: 3 },
    ]);
    expect(responseData.departmentSpend).toEqual([
      { _id: "dep1", name: "Engineering", total: 1000, count: 5 }
    ]);
  });

  async function getPaymentSources(row?: Record<string, unknown>) {
    vi.mocked(verifyAuth).mockResolvedValueOnce({ uid: "user-123", role: "admin" } as any);
    vi.mocked(Expense.aggregate)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(row ? [row] : [])
      .mockResolvedValueOnce([]);

    const result = await GET(mockReq);
    return (result as any).data.paymentSources;
  }

  it("sums pocket and company shares so a split expense counts on both sides", async () => {
    // Two expenses: one split (60 pocket / 40 company), one wholly pocket (50).
    const paymentSources = await getPaymentSources({
      _id: null,
      pocketTotal: 110,
      pocketCount: 2,
      companyTotal: 40,
      companyCount: 1,
    });

    expect(paymentSources).toEqual([
      { name: "pocket", total: 110, count: 2 },
      { name: "company", total: 40, count: 1 },
    ]);
    const paymentSourcePipeline = vi.mocked(Expense.aggregate).mock.calls[2][0] as any[];
    expect(paymentSourcePipeline[1]).toEqual({
      $project: {
        paymentSource: 1,
        pocket: pocketBaseExpr,
        company: companyBaseExpr,
        hasPocketEntry: { $in: ["pocket", { $ifNull: ["$payments.source", []] }] },
        hasCompanyEntry: { $in: ["company", { $ifNull: ["$payments.source", []] }] },
      },
    });
  });

  it("counts a shared expense on each side it has a payment", async () => {
    await getPaymentSources();
    const [, ...pipeline] = vi.mocked(Expense.aggregate).mock.calls[2][0] as any[];
    const shared = (sources: string[]) => ({
      amount: 100,
      amountInBaseCurrency: 100,
      paymentSource: "multiple",
      pocketAmountInBaseCurrency: (100 * sources.filter((source) => source === "pocket").length) / sources.length,
      payments: sources.map((source) => ({ source, amountInBaseCurrency: 100 / sources.length })),
    });

    const [totals] = new Aggregator(pipeline).run([
      { amount: 100, amountInBaseCurrency: 100, paymentSource: "pocket", pocketAmountInBaseCurrency: 100 },
      // Legacy company doc without pocket fields or payments.
      { amount: 40, paymentSource: "company" },
      { amount: 100, amountInBaseCurrency: 100, paymentSource: "split", pocketAmountInBaseCurrency: 30 },
      shared(["company", "company"]),
      shared(["pocket", "company"]),
    ]) as any[];

    expect(totals).toEqual(
      expect.objectContaining({
        pocketTotal: 180,
        pocketCount: 3,
        companyTotal: 260,
        companyCount: 4,
      })
    );
  });

  it("omits a payment side with no expenses", async () => {
    const paymentSources = await getPaymentSources({
      _id: null,
      pocketTotal: 0,
      pocketCount: 0,
      companyTotal: 250,
      companyCount: 3,
    });

    expect(paymentSources).toEqual([{ name: "company", total: 250, count: 3 }]);
  });

  it("returns no payment sources when nothing matches the filter", async () => {
    expect(await getPaymentSources()).toEqual([]);
  });

  it("intersects monthly trend aggregation with active date filters", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-04T12:00:00.000Z"));
    vi.mocked(verifyAuth).mockResolvedValueOnce({ uid: "user-123", role: "admin" } as any);
    vi.mocked(Expense.aggregate)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await GET({
      url: "http://localhost/api/dashboard/charts?from=2026-06-15&to=2026-06-20",
    } as NextRequest);

    const trendPipeline = vi.mocked(Expense.aggregate).mock.calls[0][0] as any[];
    const trendDateFilter = trendPipeline[0].$match.date;

    expect(trendDateFilter.$gte.toISOString()).toBe("2026-06-15T00:00:00.000Z");
    expect(trendDateFilter.$lte.toISOString()).toBe("2026-06-20T23:59:59.999Z");
    expect(trendDateFilter.$lt.toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });
});
