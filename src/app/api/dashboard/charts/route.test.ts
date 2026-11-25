import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import mongoose from "mongoose";
import { Aggregator } from "mingo";
import "mingo/init/system";
import { NextRequest, NextResponse } from "next/server";
import { GET } from "./route";
import { verifyAuth, type AuthUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Expense from "@/models/Expense";
import { baseTotalExpr } from "@/lib/expense";

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

  it("should aggregate and return the trend, categories and departments", async () => {
    vi.mocked(verifyAuth).mockResolvedValueOnce({ uid: "user-123", role: "admin" } as any);

    // Mock the 3 aggregation results in order: trendRows, categoryRows, departmentSpendRows
    vi.mocked(Expense.aggregate)
      .mockResolvedValueOnce([{ _id: { y: 2026, m: 6 }, total: 1000, count: 5 }]) // trend
      .mockResolvedValueOnce([{ _id: "cat1", name: "Software", total: 800, count: 3 }]) // categories
      .mockResolvedValueOnce([ // departments
        { _id: "dep1", name: "Engineering", total: 1000, count: 5 }
      ]);

    const result = await GET(mockReq);

    expect(connectDB).toHaveBeenCalled();
    expect(Expense.aggregate).toHaveBeenCalledTimes(3);

    expect(NextResponse.json).toHaveBeenCalled();
    const responseData = (result as any).data;

    expect(responseData.monthlyTrend).toBeDefined();
    expect(responseData.topCategories).toEqual([{ _id: "cat1", name: "Software", total: 800, count: 3 }]);
    expect(responseData.departmentSpend).toEqual([
      { _id: "dep1", name: "Engineering", total: 1000, count: 5 }
    ]);
    // The company/pocket split comes from /api/dashboard/stats (the expense summary).
    expect(responseData).not.toHaveProperty("paymentSources");
    // Every chart sums the shared base-currency total (legacy docs fall back to `amount`).
    for (const [pipeline] of vi.mocked(Expense.aggregate).mock.calls as any[]) {
      expect(pipeline[1].$group.total).toEqual({ $sum: baseTotalExpr });
    }
  });

  it("intersects monthly trend aggregation with active date filters", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-04T12:00:00.000Z"));
    vi.mocked(verifyAuth).mockResolvedValueOnce({ uid: "user-123", role: "admin" } as any);
    vi.mocked(Expense.aggregate)
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

describe("GET /api/dashboard/charts: whose money each chart counts", () => {
  const oid = (hex: string) => new mongoose.Types.ObjectId(hex);
  const ASHA = "66c1884c0853f8a76a4da201";
  const RAVI = "66c1884c0853f8a76a4da202";
  const ADMIN = "66c1884c0853f8a76a4da203";
  const TRAVEL = oid("66c1884c0853f8a76a4da601");
  const MEALS = oid("66c1884c0853f8a76a4da602");
  const SOFTWARE = oid("66c1884c0853f8a76a4da603");
  const SALES = oid("66c1884c0853f8a76a4da701");
  const ENGINEERING = oid("66c1884c0853f8a76a4da702");

  const collections: Record<string, Record<string, unknown>[]> = {
    categories: [
      { _id: TRAVEL, name: "Travel" },
      { _id: MEALS, name: "Meals" },
      { _id: SOFTWARE, name: "Software" },
    ],
    departments: [
      { _id: SALES, name: "Sales" },
      { _id: ENGINEERING, name: "Engineering" },
    ],
  };

  let nextId = 0x500;
  function stored(fields: {
    createdBy: string;
    day: string;
    category: mongoose.Types.ObjectId;
    department: mongoose.Types.ObjectId;
    base: number;
    paymentSource: "pocket" | "company" | "split" | "multiple";
    pocketBase: number;
    payments?: { paidBy: string; amountInBaseCurrency: number; source: "pocket" | "company" }[];
  }) {
    nextId += 1;
    return {
      _id: oid(`66c1884c0853f8a76a4d${nextId.toString(16).padStart(4, "0")}`),
      createdBy: oid(fields.createdBy),
      date: new Date(`${fields.day}T10:00:00.000Z`),
      category: fields.category,
      department: fields.department,
      amount: fields.base,
      amountInBaseCurrency: fields.base,
      paymentSource: fields.paymentSource,
      pocketAmountInBaseCurrency: fields.pocketBase,
      payments: (fields.payments ?? []).map((entry) => ({
        ...entry,
        paidBy: oid(entry.paidBy),
        amount: entry.amountInBaseCurrency,
      })),
    };
  }

  // "Today" is 25 Nov 2026, so the trend covers Jun–Nov 2026.
  const docs = [
    // Asha submits a ₹10,000 bill she paid ₹2,000 of; Ravi paid the other ₹8,000.
    stored({
      createdBy: ASHA, day: "2026-10-10", category: TRAVEL, department: SALES,
      base: 10000, paymentSource: "multiple", pocketBase: 10000,
      payments: [
        { paidBy: ASHA, amountInBaseCurrency: 2000, source: "pocket" },
        { paidBy: RAVI, amountInBaseCurrency: 8000, source: "pocket" },
      ],
    }),
    // Ravi submits a ₹3,000 dinner: he paid ₹1,800.50, Asha ₹1,199.50 on the company card.
    stored({
      createdBy: RAVI, day: "2026-11-15", category: MEALS, department: ENGINEERING,
      base: 3000, paymentSource: "multiple", pocketBase: 1800.5,
      payments: [
        { paidBy: RAVI, amountInBaseCurrency: 1800.5, source: "pocket" },
        { paidBy: ASHA, amountInBaseCurrency: 1199.5, source: "company" },
      ],
    }),
    // Asha's own, two of which only add up to 0.3 with floating-point noise.
    stored({ createdBy: ASHA, day: "2026-09-03", category: MEALS, department: SALES, base: 0.1, paymentSource: "pocket", pocketBase: 0.1 }),
    stored({ createdBy: ASHA, day: "2026-09-04", category: MEALS, department: SALES, base: 0.2, paymentSource: "pocket", pocketBase: 0.2 }),
    // Before the trend window: still in the category and department charts.
    stored({ createdBy: ASHA, day: "2026-03-15", category: TRAVEL, department: SALES, base: 500, paymentSource: "pocket", pocketBase: 500 }),
    // Ravi's own.
    stored({ createdBy: RAVI, day: "2026-11-02", category: SOFTWARE, department: ENGINEERING, base: 2490.45, paymentSource: "company", pocketBase: 0 }),
    stored({ createdBy: RAVI, day: "2026-09-20", category: MEALS, department: ENGINEERING, base: 450.75, paymentSource: "split", pocketBase: 200.75 }),
  ];

  function signIn(_id: string, role: AuthUser["role"]) {
    vi.mocked(verifyAuth).mockResolvedValue({ _id, email: "x@example.com", name: "X", role });
  }

  type Row = { name: string; total: number; count: number };
  async function charts(): Promise<{
    monthlyTrend: { month: string; key: string; total: number; count: number }[];
    topCategories: Row[];
    departmentSpend: Row[];
  }> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((await GET({ url: "http://localhost/api/dashboard/charts" } as NextRequest)) as any).data;
  }
  const rows = (list: Row[]) => list.map(({ name, total, count }) => ({ name, total, count }));
  const trend = (list: { key: string; total: number; count: number }[]) =>
    Object.fromEntries(list.map(({ key, total, count }) => [key, { total, count }]));

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-25T12:00:00.000Z"));
    vi.mocked(Expense.aggregate).mockReset();
    vi.mocked(Expense.aggregate).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((pipeline: any[]) =>
        Promise.resolve(
          new Aggregator(pipeline, { collectionResolver: (name: string) => collections[name] ?? [] }).run(docs)
        )) as never
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(Expense.aggregate).mockReset();
  });

  it("counts only a user's own share of shared bills, in every chart", async () => {
    signIn(ASHA, "user");
    const data = await charts();

    expect(data.monthlyTrend.map((month) => month.month)).toEqual(["Jun", "Jul", "Aug", "Sep", "Oct", "Nov"]);
    expect(trend(data.monthlyTrend)).toEqual({
      "2026-06": { total: 0, count: 0 },
      "2026-07": { total: 0, count: 0 },
      "2026-08": { total: 0, count: 0 },
      "2026-09": { total: 0.3, count: 2 },
      "2026-10": { total: 2000, count: 1 },
      "2026-11": { total: 1199.5, count: 1 },
    });
    expect(rows(data.topCategories)).toEqual([
      { name: "Travel", total: 2500, count: 2 },
      { name: "Meals", total: 1199.8, count: 3 },
    ]);
    expect(rows(data.departmentSpend)).toEqual([
      { name: "Sales", total: 2500.3, count: 4 },
      { name: "Engineering", total: 1199.5, count: 1 },
    ]);
  });

  it("counts a payer's part of a bill someone else submitted, plus their own expenses", async () => {
    signIn(RAVI, "user");
    const data = await charts();

    expect(trend(data.monthlyTrend)).toEqual({
      "2026-06": { total: 0, count: 0 },
      "2026-07": { total: 0, count: 0 },
      "2026-08": { total: 0, count: 0 },
      "2026-09": { total: 450.75, count: 1 },
      "2026-10": { total: 8000, count: 1 },
      "2026-11": { total: 4290.95, count: 2 },
    });
    expect(rows(data.topCategories)).toEqual([
      { name: "Travel", total: 8000, count: 1 },
      { name: "Software", total: 2490.45, count: 1 },
      { name: "Meals", total: 2251.25, count: 2 },
    ]);
    expect(rows(data.departmentSpend)).toEqual([
      { name: "Sales", total: 8000, count: 1 },
      { name: "Engineering", total: 4741.7, count: 3 },
    ]);
  });

  it("counts whole expenses for an admin, which the people's shares add up to", async () => {
    signIn(ADMIN, "admin");
    const data = await charts();

    expect(trend(data.monthlyTrend)).toEqual({
      "2026-06": { total: 0, count: 0 },
      "2026-07": { total: 0, count: 0 },
      "2026-08": { total: 0, count: 0 },
      "2026-09": { total: 451.05, count: 3 },
      "2026-10": { total: 10000, count: 1 },
      "2026-11": { total: 5490.45, count: 2 },
    });
    expect(rows(data.topCategories)).toEqual([
      { name: "Travel", total: 10500, count: 2 },
      { name: "Meals", total: 3451.05, count: 4 },
      { name: "Software", total: 2490.45, count: 1 },
    ]);
    expect(rows(data.departmentSpend)).toEqual([
      { name: "Sales", total: 10500.3, count: 4 },
      { name: "Engineering", total: 5941.2, count: 3 },
    ]);

    // Asha's and Ravi's figures add up to the admin's, to the paisa.
    signIn(ASHA, "user");
    const asha = await charts();
    signIn(RAVI, "user");
    const ravi = await charts();
    const paise = (value: number) => Math.round(value * 100);
    for (const [index, month] of data.monthlyTrend.entries()) {
      expect(paise(asha.monthlyTrend[index].total) + paise(ravi.monthlyTrend[index].total)).toBe(paise(month.total));
    }
    const byName = (list: Row[], name: string) => list.find((row) => row.name === name)?.total ?? 0;
    for (const [list, own, others] of [
      [data.topCategories, asha.topCategories, ravi.topCategories],
      [data.departmentSpend, asha.departmentSpend, ravi.departmentSpend],
    ] as const) {
      for (const row of list) {
        expect(paise(byName(own, row.name)) + paise(byName(others, row.name))).toBe(paise(row.total));
      }
    }
  });

  it("rounds every returned total to the paisa", async () => {
    signIn(ASHA, "user");
    const data = await charts();

    // The trend's September bucket sums ₹0.10 + ₹0.20, which is 0.30000000000000004 unrounded.
    const [trendRows] = vi.mocked(Expense.aggregate).mock.results.map((result) => result.value) as Promise<
      { _id: { y: number; m: number }; total: number }[]
    >[];
    const september = (await trendRows).find((row) => row._id.y === 2026 && row._id.m === 9);
    expect(september?.total).not.toBe(0.3);
    expect(data.monthlyTrend.find((month) => month.key === "2026-09")?.total).toBe(0.3);

    const all = [
      ...data.monthlyTrend.map((month) => month.total),
      ...data.topCategories.map((row) => row.total),
      ...data.departmentSpend.map((row) => row.total),
    ];
    for (const total of all) expect(total).toBe(Math.round(total * 100) / 100);
  });
});
