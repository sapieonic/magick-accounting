import { beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { Aggregator, Query } from "mingo";
import "mingo/init/system";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";
import { verifyAuth } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Expense from "@/models/Expense";
import Currency from "@/models/Currency";
import Asset from "@/models/Asset";
import User from "@/models/User";
import Trip from "@/models/Trip";
import { encodeExpenseCursor } from "@/lib/expense-query";

vi.mock("@/lib/auth", () => ({ verifyAuth: vi.fn() }));
vi.mock("@/lib/mongodb", () => ({ connectDB: vi.fn() }));
vi.mock("@/lib/mongodb-transaction", () => ({
  runInTransaction: vi.fn((work) => work(null, true)),
  sessionOptions: vi.fn(() => ({})),
}));
vi.mock("@/lib/asset-server", () => ({
  compensateAssetCreation: vi.fn(),
  createAssetsForExpense: vi.fn(),
  ensureAssetIndexes: vi.fn(),
}));
vi.mock("@/models/Expense", () => ({
  default: {
    create: vi.fn(),
    exists: vi.fn(),
    findById: vi.fn(),
    deleteOne: vi.fn(),
    aggregate: vi.fn(),
    find: vi.fn(),
    countDocuments: vi.fn(),
    updateMany: vi.fn(),
  },
}));
vi.mock("@/models/Currency", () => ({ default: { findById: vi.fn(), findOne: vi.fn() } }));
vi.mock("@/models/Asset", () => ({ default: { find: vi.fn(), aggregate: vi.fn() } }));
vi.mock("@/models/Trip", () => ({ default: { findById: vi.fn(), find: vi.fn() } }));
vi.mock("@/models/Category", () => ({ default: {} }));
vi.mock("@/models/Department", () => ({ default: {} }));
vi.mock("@/models/User", () => ({ default: { countDocuments: vi.fn() } }));

describe("POST /api/expenses payment split", () => {
  const expenseId = "66c1884c0853f8a76a4da111";

  function chain(result: unknown) {
    const query = {
      populate: vi.fn(() => query),
      sort: vi.fn(() => query),
      lean: vi.fn().mockResolvedValue(result),
    };
    return query;
  }

  function post(body: Record<string, unknown>) {
    return POST({
      json: async () => ({
        title: "Client dinner",
        amount: 100,
        currency: "usd-id",
        category: "category-id",
        department: "department-id",
        date: "2026-06-01",
        ...body,
      }),
    } as unknown as NextRequest);
  }

  function createdExpense() {
    return (vi.mocked(Expense.create).mock.calls[0][0] as unknown as Record<string, unknown>[])[0];
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(connectDB).mockResolvedValue(undefined);
    vi.mocked(verifyAuth).mockResolvedValue({
      _id: "user-id",
      email: "user@example.com",
      name: "User",
      role: "user",
    });
    vi.mocked(Currency.findById).mockReturnValue(chain({ _id: "usd-id", rateToBase: 83 }) as never);
    vi.mocked(Expense.create).mockResolvedValue([{ _id: expenseId }] as never);
    vi.mocked(Asset.find).mockReturnValue(chain([]) as never);
    vi.mocked(Expense.findById).mockReturnValue(chain({ _id: expenseId }) as never);
  });

  it("stores a split with its pocket share in base currency", async () => {
    const response = await post({ paymentSource: "split", pocketAmount: 40 });

    expect(response.status).toBe(201);
    expect(createdExpense()).toEqual(
      expect.objectContaining({
        amountInBaseCurrency: 8300,
        paymentSource: "split",
        pocketAmount: 40,
        pocketAmountInBaseCurrency: 3320,
      })
    );
  });

  it("defaults a missing payment source to pocket for the whole amount", async () => {
    const response = await post({});

    expect(response.status).toBe(201);
    expect(createdExpense()).toEqual(
      expect.objectContaining({
        paymentSource: "pocket",
        pocketAmount: 100,
        pocketAmountInBaseCurrency: 8300,
      })
    );
  });

  it("stores a zero pocket share for company-paid expenses", async () => {
    await post({ paymentSource: "company", pocketAmount: 40 });

    expect(createdExpense()).toEqual(
      expect.objectContaining({
        paymentSource: "company",
        pocketAmount: 0,
        pocketAmountInBaseCurrency: 0,
      })
    );
  });

  it("rejects a split pocket amount that is not less than the total", async () => {
    const response = await post({ paymentSource: "split", pocketAmount: 100 });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Pocket amount must be more than 0 and less than the total amount",
    });
    expect(Expense.create).not.toHaveBeenCalled();
  });

  describe("paid by several people", () => {
    const asha = "66c1884c0853f8a76a4da201";
    const ravi = "66c1884c0853f8a76a4da202";

    it("stores each payer's part with base amounts that add up to the total", async () => {
      vi.mocked(User.countDocuments).mockResolvedValue(2 as never);

      const response = await post({
        amount: 100,
        paymentSource: "multiple",
        payments: [
          { paidBy: asha, amount: 33.33, source: "pocket" },
          { paidBy: ravi, amount: 33.33, source: "company" },
          { paidBy: asha, amount: 33.34, source: "company" },
        ],
      });

      expect(response.status).toBe(201);
      expect(User.countDocuments).toHaveBeenCalledWith({ _id: { $in: [asha, ravi] } });
      expect(createdExpense()).toEqual(
        expect.objectContaining({
          amountInBaseCurrency: 8300,
          paymentSource: "multiple",
          pocketAmount: 33.33,
          pocketAmountInBaseCurrency: 2766.39,
          payments: [
            { paidBy: asha, amount: 33.33, source: "pocket", amountInBaseCurrency: 2766.39 },
            { paidBy: ravi, amount: 33.33, source: "company", amountInBaseCurrency: 2766.39 },
            { paidBy: asha, amount: 33.34, source: "company", amountInBaseCurrency: 2767.22 },
          ],
        })
      );
    });

    it("rejects payments that don't add up to the total", async () => {
      const response = await post({
        amount: 100,
        paymentSource: "multiple",
        payments: [
          { paidBy: asha, amount: 60, source: "pocket" },
          { paidBy: ravi, amount: 30, source: "pocket" },
        ],
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "Payments add up to 90.00 but the total amount is 100.00",
      });
      expect(Expense.create).not.toHaveBeenCalled();
    });

    it("rejects a payer who isn't a user", async () => {
      vi.mocked(User.countDocuments).mockResolvedValue(1 as never);

      const response = await post({
        amount: 100,
        paymentSource: "multiple",
        payments: [
          { paidBy: asha, amount: 50, source: "pocket" },
          { paidBy: ravi, amount: 50, source: "pocket" },
        ],
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "A payer is not a user of this app" });
      expect(Expense.create).not.toHaveBeenCalled();
    });

    it("stores no payer list for other payment sources", async () => {
      await post({
        paymentSource: "pocket",
        payments: [{ paidBy: asha, amount: 100, source: "company" }],
      });

      expect(createdExpense()).toEqual(expect.objectContaining({ paymentSource: "pocket", payments: [] }));
      expect(User.countDocuments).not.toHaveBeenCalled();
    });
  });
});

describe("POST /api/expenses trip", () => {
  const userId = "66c1884c0853f8a76a4da201";
  const tripId = "66c1884c0853f8a76a4da301";

  function chain(result: unknown) {
    const query = {
      populate: vi.fn(() => query),
      select: vi.fn(() => query),
      sort: vi.fn(() => query),
      lean: vi.fn().mockResolvedValue(result),
    };
    return query;
  }

  function post(body: Record<string, unknown>) {
    return POST({
      json: async () => ({
        title: "Flight to Goa",
        amount: 100,
        category: "category-id",
        department: "department-id",
        date: "2026-10-01",
        ...body,
      }),
    } as unknown as NextRequest);
  }

  function createdExpense() {
    return (vi.mocked(Expense.create).mock.calls[0][0] as unknown as Record<string, unknown>[])[0];
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(connectDB).mockResolvedValue(undefined as never);
    vi.mocked(verifyAuth).mockResolvedValue({
      _id: userId,
      email: "asha@example.com",
      name: "Asha",
      role: "user",
    });
    vi.mocked(Currency.findOne).mockReturnValue(chain({ _id: "inr-id", rateToBase: 1 }) as never);
    vi.mocked(Expense.create).mockResolvedValue([{ _id: "66c1884c0853f8a76a4da111" }] as never);
    vi.mocked(Asset.find).mockReturnValue(chain([]) as never);
    vi.mocked(Expense.findById).mockReturnValue(chain({ _id: "66c1884c0853f8a76a4da111" }) as never);
  });

  it("stores the trip and travel type for a traveler, and populates the trip name", async () => {
    vi.mocked(Trip.findById).mockReturnValue(
      chain({ travelers: [new mongoose.Types.ObjectId(userId)], createdBy: "someone" }) as never
    );

    const response = await post({ trip: tripId, travelType: "flight" });

    expect(response.status).toBe(201);
    expect(createdExpense()).toEqual(
      expect.objectContaining({ trip: new mongoose.Types.ObjectId(tripId), travelType: "flight" })
    );
    const populated = vi.mocked(Expense.findById).mock.results[0].value;
    expect(populated.populate).toHaveBeenCalledWith("trip", "name");
  });

  it("drops the travel type when the expense is in no trip", async () => {
    const response = await post({ trip: "", travelType: "cab" });

    expect(response.status).toBe(201);
    expect(createdExpense()).toEqual(expect.objectContaining({ trip: null, travelType: null }));
    expect(Trip.findById).not.toHaveBeenCalled();
  });

  it("defaults to no trip when none is sent", async () => {
    await post({});
    expect(createdExpense()).toEqual(expect.objectContaining({ trip: null, travelType: null }));
  });

  it("rejects a trip the user isn't on", async () => {
    vi.mocked(Trip.findById).mockReturnValue(
      chain({ travelers: [new mongoose.Types.ObjectId()], createdBy: new mongoose.Types.ObjectId() }) as never
    );

    const response = await post({ trip: tripId, travelType: "flight" });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "You can only add expenses to trips you are on" });
    expect(Expense.create).not.toHaveBeenCalled();
  });

  it("rejects an unknown travel type or trip", async () => {
    const badType = await post({ trip: tripId, travelType: "yacht" });
    expect(badType.status).toBe(400);
    expect(await badType.json()).toEqual({ error: "Travel type is invalid" });

    vi.mocked(Trip.findById).mockReturnValue(chain(null) as never);
    const missingTrip = await post({ trip: tripId });
    expect(await missingTrip.json()).toEqual({ error: "Trip is invalid" });
    expect(Expense.create).not.toHaveBeenCalled();
  });
});

describe("GET /api/expenses", () => {
  const oid = () => new mongoose.Types.ObjectId();
  const goa = oid();
  const deletedTrip = oid();
  const asha = oid();

  function chain(result: unknown) {
    const query = {
      populate: vi.fn(() => query),
      select: vi.fn(() => query),
      sort: vi.fn(() => query),
      skip: vi.fn(() => query),
      limit: vi.fn(() => query),
      lean: vi.fn().mockResolvedValue(result),
    };
    return query;
  }

  function expense(title: string, day: string, trip: mongoose.Types.ObjectId | null, createdAt = "10:00") {
    return {
      _id: oid(),
      title,
      date: new Date(`${day}T00:00:00.000Z`),
      createdAt: new Date(`${day}T${createdAt}:00.000Z`),
      createdBy: asha,
      amount: 100,
      trip,
    };
  }

  // Goa's latest expense (5 Oct) puts the trip between the 6 Oct and 4 Oct singles.
  const hotel = expense("Hotel", "2026-10-05", goa);
  const flight = expense("Flight", "2026-09-01", goa);
  const cab = expense("Cab", "2026-10-05", goa, "08:00");
  const lunch = expense("Lunch", "2026-10-06", null);
  const books = expense("Books", "2026-10-04", null);
  const orphan = expense("Orphan", "2026-10-03", deletedTrip);
  const docs = [hotel, flight, cab, lunch, books, orphan];

  /** `Expense.find` over `source`, honouring sort and limit; unsorted, shuffled (as `$in` gives no order). */
  function findChain(filter: Record<string, unknown>, source = docs) {
    let cursor = new Query(filter).find(source);
    let sorted = false;
    const query = {
      populate: vi.fn(() => query),
      sort: vi.fn((spec: Record<string, 1 | -1>) => {
        cursor = cursor.sort(spec);
        sorted = true;
        return query;
      }),
      limit: vi.fn((n: number) => {
        cursor = cursor.limit(n);
        return query;
      }),
      lean: vi.fn(() => {
        const found = cursor.all();
        return Promise.resolve(sorted ? found : found.reverse());
      }),
    };
    return query;
  }

  function aggregateOver(source: Record<string, unknown>[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((pipeline: any[]) => Promise.resolve(new Aggregator(pipeline).run(source))) as never;
  }

  const titles = (body: { expenses: { title: string }[] }) => body.expenses.map((e) => e.title);

  function get(query: string) {
    return GET({ url: `http://localhost/api/expenses${query}` } as NextRequest);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(connectDB).mockResolvedValue(undefined as never);
    vi.mocked(verifyAuth).mockResolvedValue({
      _id: "66c1884c0853f8a76a4da203",
      email: "admin@example.com",
      name: "Admin",
      role: "admin",
    });
    vi.mocked(Expense.aggregate).mockImplementation(aggregateOver(docs));
    vi.mocked(Expense.find).mockImplementation(((filter: Record<string, unknown>) => findChain(filter)) as never);
    vi.mocked(Asset.aggregate).mockResolvedValue([{ _id: lunch._id, count: 1 }] as never);
    vi.mocked(Trip.find).mockReturnValue(
      chain([
        {
          _id: goa,
          name: "Goa offsite",
          destinations: ["Goa"],
          startDate: new Date("2026-10-04T00:00:00.000Z"),
          endDate: new Date("2026-10-06T00:00:00.000Z"),
          travelers: [{ _id: asha, name: "Asha", email: "asha@example.com" }],
        },
      ]) as never
    );
  });

  it("groups each trip into one item, oldest expense first inside it", async () => {
    const response = await get("?groupTrips=true&limit=3");
    const body = await response.json();

    expect(body.expenses.map((e: { title: string }) => e.title)).toEqual([
      "Lunch",
      "Flight",
      "Cab",
      "Hotel",
      "Books",
    ]);
    // Continues after Books, the third item.
    expect(body.pagination).toEqual({ total: 4, hasMore: true, nextCursor: encodeExpenseCursor(books) });
    expect(Object.keys(body.trips)).toEqual([String(goa)]);
    expect(body.trips[String(goa)]).toEqual(
      expect.objectContaining({
        name: "Goa offsite",
        startDate: "2026-10-04T00:00:00.000Z",
        travelers: [{ _id: String(asha), name: "Asha", email: "asha@example.com" }],
      })
    );
    expect(["upcoming", "ongoing", "completed"]).toContain(body.trips[String(goa)].status);
    expect(body.expenses[0].linkedAssetCount).toBe(1);
    expect(body.expenses[1].linkedAssetCount).toBe(0);
    const query = vi.mocked(Expense.find).mock.results[0].value;
    expect(query.populate).toHaveBeenCalledWith("trip", "name");
    expect(query.populate).toHaveBeenCalledWith("payments.paidBy", "name email");
    expect(Expense.countDocuments).not.toHaveBeenCalled();
  });

  it("shows a user the trips they're on, and others' trips only as plain rows", async () => {
    vi.mocked(verifyAuth).mockResolvedValue({
      _id: String(asha),
      email: "asha@example.com",
      name: "Asha",
      role: "user",
    });

    const onTrip = await (await get("?groupTrips=true&limit=3")).json();
    expect(Object.keys(onTrip.trips)).toEqual([String(goa)]);

    // Taken off the travelers (and not the creator): the cluster would link to
    // a trip page that refuses them, so the expenses come back as singles.
    vi.mocked(Trip.find).mockReturnValue(
      chain([
        {
          _id: goa,
          name: "Goa offsite",
          destinations: ["Goa"],
          startDate: new Date("2026-10-04T00:00:00.000Z"),
          endDate: new Date("2026-10-06T00:00:00.000Z"),
          travelers: [],
          createdBy: oid(),
        },
      ]) as never
    );
    const offTrip = await (await get("?groupTrips=true&limit=2")).json();
    expect(offTrip.trips).toEqual({});
    // Still one item, paged whole: two items are Lunch and all of Goa's rows.
    expect(titles(offTrip)).toEqual(["Lunch", "Flight", "Cab", "Hotel"]);
    expect(offTrip.pagination).toEqual({
      total: 4,
      hasMore: true,
      nextCursor: encodeExpenseCursor({ date: hotel.date, createdAt: hotel.createdAt, _id: goa }),
    });
    // The trip still exists, so its expenses are not unlinked.
    expect(Expense.updateMany).not.toHaveBeenCalled();
  });

  it("leaves a trip whose document is gone out of the trips map", async () => {
    vi.mocked(Trip.find).mockReturnValue(chain([]) as never);

    const body = await (await get(`?groupTrips=true&limit=3&cursor=${encodeExpenseCursor(books)}`)).json();

    expect(body.expenses.map((e: { title: string }) => e.title)).toEqual(["Orphan"]);
    expect(body.trips).toEqual({});
    expect((vi.mocked(Trip.find).mock.calls[0] as unknown[])[0]).toEqual({ _id: { $in: [deletedTrip] } });
    // Finishes the interrupted trip delete so the orphan stops being a trip item.
    expect(Expense.updateMany).toHaveBeenCalledWith(
      { trip: { $in: [deletedTrip] } },
      { $set: { trip: null, travelType: null } }
    );
  });

  it("continues a grouped page after the cursor, even once earlier items are deleted", async () => {
    const first = await (await get("?groupTrips=true&limit=2")).json();
    expect(titles(first)).toEqual(["Lunch", "Flight", "Cab", "Hotel"]);
    expect(first.pagination.hasMore).toBe(true);

    // Lunch and Goa's flight are deleted before the next page is asked for.
    vi.mocked(Expense.aggregate).mockImplementation(aggregateOver(docs.filter((d) => d !== lunch && d !== flight)));
    const next = await (await get(`?groupTrips=true&limit=2&cursor=${first.pagination.nextCursor}`)).json();

    expect(titles(next)).toEqual(["Books", "Orphan"]);
    // Only the first page counts the items; later pages don't recount them.
    expect(next.pagination).toEqual({ total: null, hasMore: false, nextCursor: null });
    const pipeline = vi.mocked(Expense.aggregate).mock.calls[1][0] as unknown as Record<string, unknown>[];
    const facet = pipeline.find((stage) => "$facet" in stage) as { $facet: Record<string, unknown> };
    expect(Object.keys(facet.$facet)).toEqual(["items"]);
  });

  it("continues a flat page after the cursor, even once earlier rows are deleted", async () => {
    vi.mocked(Expense.countDocuments).mockResolvedValue(6 as never);

    const first = await (await get("?limit=2")).json();
    expect(titles(first)).toEqual(["Lunch", "Hotel"]);
    expect(first.pagination).toEqual({ total: 6, hasMore: true, nextCursor: encodeExpenseCursor(hotel) });
    const query = vi.mocked(Expense.find).mock.results[0].value;
    expect(query.sort).toHaveBeenCalledWith({ date: -1, createdAt: -1, _id: -1 });
    expect(query.limit).toHaveBeenCalledWith(3);

    // Hotel is deleted: Cab (same day, entered earlier) still comes next.
    vi.mocked(Expense.find).mockImplementation(((filter: Record<string, unknown>) =>
      findChain(filter, docs.filter((d) => d !== hotel))) as never);
    const next = await (await get(`?limit=2&cursor=${first.pagination.nextCursor}`)).json();
    expect(titles(next)).toEqual(["Cab", "Books"]);
    // Only the first page counts; pages after a cursor don't recount.
    expect(next.pagination).toEqual({ total: null, hasMore: true, nextCursor: encodeExpenseCursor(books) });

    const last = await (await get(`?limit=2&cursor=${next.pagination.nextCursor}`)).json();
    expect(titles(last)).toEqual(["Orphan", "Flight"]);
    expect(last.pagination).toEqual({ total: null, hasMore: false, nextCursor: null });
    expect(Expense.countDocuments).toHaveBeenCalledTimes(1);
  });

  it("caps an oversized limit at the largest page", async () => {
    vi.mocked(Expense.countDocuments).mockResolvedValue(6 as never);

    await get("?limit=1000000");

    const query = vi.mocked(Expense.find).mock.results[0].value;
    expect(query.limit).toHaveBeenCalledWith(10001);
  });

  it("refuses a malformed cursor", async () => {
    const response = await get("?cursor=not-a-cursor");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Page cursor is invalid" });
    expect(Expense.find).not.toHaveBeenCalled();
  });

  it("handles a page with no matches", async () => {
    vi.mocked(Expense.aggregate).mockResolvedValue([{ items: [], total: [] }] as never);

    const body = await (await get("?groupTrips=true")).json();

    expect(body).toEqual({
      expenses: [],
      trips: {},
      pagination: { total: 0, hasMore: false, nextCursor: null },
    });
    expect(Expense.find).not.toHaveBeenCalled();
    expect(Trip.find).not.toHaveBeenCalled();
  });

  it("returns the company and pocket split with the summary", async () => {
    vi.mocked(Expense.countDocuments).mockResolvedValue(6 as never);
    // Hotel went on the company card and lunch was split; the rest (no pocket
    // fields, like legacy documents) count wholly as pocket.
    Object.assign(hotel, { paymentSource: "company", amountInBaseCurrency: 100, pocketAmountInBaseCurrency: 0 });
    Object.assign(lunch, { paymentSource: "split", amountInBaseCurrency: 100, pocketAmountInBaseCurrency: 30 });

    try {
      const flat = await (await get("?limit=20&includeSummary=true")).json();
      expect(flat.summary).toEqual({ totalExpenses: 6, totalAmount: 600, companyAmount: 170, pocketAmount: 430 });

      const grouped = await (await get("?groupTrips=true&limit=3&includeSummary=true")).json();
      expect(grouped.summary).toEqual(flat.summary);
    } finally {
      for (const doc of [hotel, lunch]) {
        for (const key of ["paymentSource", "amountInBaseCurrency", "pocketAmountInBaseCurrency"]) {
          delete (doc as Record<string, unknown>)[key];
        }
      }
    }
  });

  it("keeps the flat list (now with the trip populated) by default", async () => {
    vi.mocked(Expense.countDocuments).mockResolvedValue(6 as never);

    const body = await (await get("?limit=20")).json();

    expect(body.expenses).toHaveLength(6);
    expect(body).not.toHaveProperty("trips");
    expect(body.pagination).toEqual({ total: 6, hasMore: false, nextCursor: null });
    const query = vi.mocked(Expense.find).mock.results[0].value;
    expect(query.sort).toHaveBeenCalledWith({ date: -1, createdAt: -1, _id: -1 });
    expect(query.populate).toHaveBeenCalledWith("trip", "name");
    expect(Expense.aggregate).not.toHaveBeenCalled();
  });
});
