import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { GET } from "./route";
import { verifyAuth } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Expense from "@/models/Expense";

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
        { name: "company", total: 600, count: 2 },
        { name: "pocket", total: 400, count: 3 },
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
