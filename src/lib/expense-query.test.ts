import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";
import type { AuthUser } from "@/lib/auth";

// Mock the Expense model so getExpenseSummary can be tested without a DB.
vi.mock("@/models/Expense", () => ({
  default: { aggregate: vi.fn() },
}));

import { buildExpenseFilter, getExpenseSummary } from "@/lib/expense-query";
import Expense from "@/models/Expense";

const USER_ID = "507f1f77bcf86cd799439011";
const OTHER_ID = "507f1f77bcf86cd799439012";
const CAT_A = "507f191e810c19729de860ea";
const CAT_B = "507f191e810c19729de860eb";
const DEP_A = "507f191e810c19729de860ec";
const DEP_B = "507f191e810c19729de860ed";

function makeUser(role: AuthUser["role"], _id = USER_ID): AuthUser {
  return { _id, email: "u@example.com", name: "U", role };
}

function params(qs: string): URLSearchParams {
  return new URLSearchParams(qs);
}

describe("buildExpenseFilter — role scoping", () => {
  it("scopes role 'user' to their own createdBy as an ObjectId", () => {
    const filter = buildExpenseFilter(params(""), makeUser("user"));
    expect(filter.createdBy).toBeInstanceOf(mongoose.Types.ObjectId);
    expect((filter.createdBy as mongoose.Types.ObjectId).toString()).toBe(USER_ID);
  });

  it("role 'user' IGNORES any createdBy query param", () => {
    const filter = buildExpenseFilter(params(`createdBy=${OTHER_ID}`), makeUser("user"));
    expect((filter.createdBy as mongoose.Types.ObjectId).toString()).toBe(USER_ID);
  });

  it("role 'admin' honors a valid createdBy param", () => {
    const filter = buildExpenseFilter(params(`createdBy=${OTHER_ID}`), makeUser("admin"));
    expect(filter.createdBy).toBeInstanceOf(mongoose.Types.ObjectId);
    expect((filter.createdBy as mongoose.Types.ObjectId).toString()).toBe(OTHER_ID);
  });

  it("role 'master_admin' honors a valid createdBy param", () => {
    const filter = buildExpenseFilter(params(`createdBy=${OTHER_ID}`), makeUser("master_admin"));
    expect((filter.createdBy as mongoose.Types.ObjectId).toString()).toBe(OTHER_ID);
  });

  it("admin with no createdBy param has no createdBy key", () => {
    const filter = buildExpenseFilter(params(""), makeUser("admin"));
    expect(filter).not.toHaveProperty("createdBy");
  });

  it("admin ignores an invalid createdBy ObjectId", () => {
    const filter = buildExpenseFilter(params("createdBy=not-an-objectid"), makeUser("admin"));
    expect(filter).not.toHaveProperty("createdBy");
  });
});

describe("buildExpenseFilter — multi-select departments/categories", () => {
  it("single value -> direct equality (ObjectId)", () => {
    const filter = buildExpenseFilter(params(`category=${CAT_A}`), makeUser("admin"));
    expect(filter.category).toBeInstanceOf(mongoose.Types.ObjectId);
    expect((filter.category as mongoose.Types.ObjectId).toString()).toBe(CAT_A);
  });

  it("repeated params -> $in", () => {
    const filter = buildExpenseFilter(
      params(`category=${CAT_A}&category=${CAT_B}`),
      makeUser("admin")
    );
    const inClause = filter.category as { $in: mongoose.Types.ObjectId[] };
    expect(inClause.$in.map((o) => o.toString())).toEqual([CAT_A, CAT_B]);
  });

  it("comma-separated -> $in", () => {
    const filter = buildExpenseFilter(params(`category=${CAT_A},${CAT_B}`), makeUser("admin"));
    const inClause = filter.category as { $in: mongoose.Types.ObjectId[] };
    expect(inClause.$in.map((o) => o.toString())).toEqual([CAT_A, CAT_B]);
  });

  it("mixed repeated + comma -> $in", () => {
    const filter = buildExpenseFilter(
      params(`department=${DEP_A}&department=${DEP_B},${CAT_A}`),
      makeUser("admin")
    );
    const inClause = filter.department as { $in: mongoose.Types.ObjectId[] };
    expect(inClause.$in.map((o) => o.toString())).toEqual([DEP_A, DEP_B, CAT_A]);
  });

  it("dedupes duplicate ids", () => {
    const filter = buildExpenseFilter(
      params(`category=${CAT_A}&category=${CAT_A},${CAT_A}`),
      makeUser("admin")
    );
    // Only one unique id -> direct equality, not $in.
    expect(filter.category).toBeInstanceOf(mongoose.Types.ObjectId);
    expect((filter.category as mongoose.Types.ObjectId).toString()).toBe(CAT_A);
  });

  it("skips invalid ObjectIds within the list", () => {
    const filter = buildExpenseFilter(
      params(`category=bad,${CAT_A}&category=alsobad`),
      makeUser("admin")
    );
    expect(filter.category).toBeInstanceOf(mongoose.Types.ObjectId);
    expect((filter.category as mongoose.Types.ObjectId).toString()).toBe(CAT_A);
  });

  it("empty / all-invalid -> no filter key", () => {
    const filter = buildExpenseFilter(params("category=bad&department="), makeUser("admin"));
    expect(filter).not.toHaveProperty("category");
    expect(filter).not.toHaveProperty("department");
  });

  it("handles departments and categories independently", () => {
    const filter = buildExpenseFilter(
      params(`department=${DEP_A}&category=${CAT_A}&category=${CAT_B}`),
      makeUser("admin")
    );
    expect((filter.department as mongoose.Types.ObjectId).toString()).toBe(DEP_A);
    const cats = filter.category as { $in: mongoose.Types.ObjectId[] };
    expect(cats.$in.map((o) => o.toString())).toEqual([CAT_A, CAT_B]);
  });
});

describe("buildExpenseFilter — search", () => {
  it("builds a case-insensitive $or regex on title and description", () => {
    const filter = buildExpenseFilter(params("search=lunch"), makeUser("admin"));
    const or = filter.$or as Array<{ title?: RegExp; description?: RegExp }>;
    expect(or).toHaveLength(2);
    const title = or[0].title as RegExp;
    const desc = or[1].description as RegExp;
    expect(title).toBeInstanceOf(RegExp);
    expect(title.flags).toContain("i");
    expect(desc).toBeInstanceOf(RegExp);
    expect(title.test("LUNCH meeting")).toBe(true);
  });

  it("escapes regex special characters (literal match)", () => {
    const filter = buildExpenseFilter(params("search=a.b*c"), makeUser("admin"));
    const or = filter.$or as Array<{ title?: RegExp }>;
    const title = or[0].title as RegExp;
    // Special chars must be escaped in the source.
    expect(title.source).toContain("a\\.b\\*c");
    // And must NOT match the regex-interpreted form.
    expect(title.test("axbbbc")).toBe(false);
    // But matches the literal string.
    expect(title.test("a.b*c")).toBe(true);
  });

  it("trims whitespace-only search to no key", () => {
    const filter = buildExpenseFilter(params("search=%20%20"), makeUser("admin"));
    expect(filter).not.toHaveProperty("$or");
  });

  it("no search param -> no $or key", () => {
    const filter = buildExpenseFilter(params(""), makeUser("admin"));
    expect(filter).not.toHaveProperty("$or");
  });
});

describe("buildExpenseFilter — date boundaries", () => {
  it("from and to -> $gte start-of-day and $lte end-of-day (UTC)", () => {
    const filter = buildExpenseFilter(
      params("from=2024-01-15&to=2024-01-20"),
      makeUser("admin")
    );
    const date = filter.date as { $gte: Date; $lte: Date };
    expect(date.$gte.getUTCHours()).toBe(0);
    expect(date.$gte.getUTCMinutes()).toBe(0);
    expect(date.$gte.getUTCSeconds()).toBe(0);
    expect(date.$gte.getUTCMilliseconds()).toBe(0);
    expect(date.$gte.getUTCFullYear()).toBe(2024);
    expect(date.$gte.getUTCMonth()).toBe(0);
    expect(date.$gte.getUTCDate()).toBe(15);

    expect(date.$lte.getUTCHours()).toBe(23);
    expect(date.$lte.getUTCMinutes()).toBe(59);
    expect(date.$lte.getUTCSeconds()).toBe(59);
    expect(date.$lte.getUTCMilliseconds()).toBe(999);
    expect(date.$lte.getUTCDate()).toBe(20);
  });

  it("only from -> date has $gte but no $lte", () => {
    const filter = buildExpenseFilter(params("from=2024-01-15"), makeUser("admin"));
    const date = filter.date as { $gte?: Date; $lte?: Date };
    expect(date.$gte).toBeInstanceOf(Date);
    expect(date.$lte).toBeUndefined();
  });

  it("only to -> date has $lte but no $gte", () => {
    const filter = buildExpenseFilter(params("to=2024-01-20"), makeUser("admin"));
    const date = filter.date as { $gte?: Date; $lte?: Date };
    expect(date.$lte).toBeInstanceOf(Date);
    expect(date.$gte).toBeUndefined();
  });

  it("invalid date strings are ignored", () => {
    const filter = buildExpenseFilter(
      params("from=not-a-date&to=also-bad"),
      makeUser("admin")
    );
    expect(filter).not.toHaveProperty("date");
  });

  it("no date params -> no date key", () => {
    const filter = buildExpenseFilter(params(""), makeUser("admin"));
    expect(filter).not.toHaveProperty("date");
  });

  it("valid from + invalid to -> only $gte present", () => {
    const filter = buildExpenseFilter(
      params("from=2024-01-15&to=garbage"),
      makeUser("admin")
    );
    const date = filter.date as { $gte?: Date; $lte?: Date };
    expect(date.$gte).toBeInstanceOf(Date);
    expect(date.$lte).toBeUndefined();
  });
});

describe("buildExpenseFilter — combined", () => {
  it("merges role, multi-select, search and date into one filter", () => {
    const filter = buildExpenseFilter(
      params(`category=${CAT_A}&category=${CAT_B}&search=taxi&from=2024-02-01&to=2024-02-28`),
      makeUser("user")
    );
    expect((filter.createdBy as mongoose.Types.ObjectId).toString()).toBe(USER_ID);
    expect((filter.category as { $in: mongoose.Types.ObjectId[] }).$in).toHaveLength(2);
    expect(filter.$or).toBeDefined();
    expect(filter.date).toBeDefined();
  });
});

describe("getExpenseSummary", () => {
  beforeEach(() => {
    vi.mocked(Expense.aggregate).mockReset();
  });

  it("returns totals from the aggregate result", async () => {
    vi.mocked(Expense.aggregate).mockResolvedValue([
      { _id: null, totalExpenses: 7, totalAmount: 1234.5 },
    ] as never);
    const result = await getExpenseSummary({ foo: "bar" });
    expect(result).toEqual({ totalExpenses: 7, totalAmount: 1234.5 });
  });

  it("passes the filter into the $match stage", async () => {
    vi.mocked(Expense.aggregate).mockResolvedValue([
      { totalExpenses: 1, totalAmount: 10 },
    ] as never);
    const filter = { createdBy: "abc" };
    await getExpenseSummary(filter);
    const pipeline = vi.mocked(Expense.aggregate).mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(pipeline[0]).toEqual({ $match: filter });
  });

  it("falls back to {0,0} when aggregate returns []", async () => {
    vi.mocked(Expense.aggregate).mockResolvedValue([] as never);
    const result = await getExpenseSummary({});
    expect(result).toEqual({ totalExpenses: 0, totalAmount: 0 });
  });

  it("falls back to 0 for missing fields in the summary doc", async () => {
    vi.mocked(Expense.aggregate).mockResolvedValue([{ _id: null }] as never);
    const result = await getExpenseSummary({});
    expect(result).toEqual({ totalExpenses: 0, totalAmount: 0 });
  });
});
