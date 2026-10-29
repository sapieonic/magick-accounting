import { beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { Aggregator, Query } from "mingo";
import "mingo/init/system";
import { NextRequest } from "next/server";
import { DELETE, GET, PUT } from "./route";
import { verifyAuth, type AuthUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Trip from "@/models/Trip";
import Expense from "@/models/Expense";
import Asset from "@/models/Asset";
import User from "@/models/User";

vi.mock("@/lib/auth", () => ({ verifyAuth: vi.fn() }));
vi.mock("@/lib/mongodb", () => ({ connectDB: vi.fn() }));
vi.mock("@/models/Trip", () => ({
  default: { findById: vi.fn(), findByIdAndUpdate: vi.fn(), deleteOne: vi.fn() },
}));
vi.mock("@/models/Expense", () => ({
  default: { aggregate: vi.fn(), find: vi.fn(), updateMany: vi.fn() },
}));
vi.mock("@/models/Asset", () => ({ default: { aggregate: vi.fn() } }));
vi.mock("@/models/User", () => ({ default: { countDocuments: vi.fn(), find: vi.fn() } }));
vi.mock("@/models/Department", () => ({ default: { exists: vi.fn() } }));
vi.mock("@/models/Category", () => ({ default: {} }));
vi.mock("@/models/Currency", () => ({ default: {} }));

const ASHA = "66c1884c0853f8a76a4da201";
const RAVI = "66c1884c0853f8a76a4da202";
const ADMIN = "66c1884c0853f8a76a4da203";
const OUTSIDER = "66c1884c0853f8a76a4da204";
const GOA = "66c1884c0853f8a76a4da301";

const oid = (id: string) => new mongoose.Types.ObjectId(id);
const person = (id: string, name: string) => ({ _id: oid(id), name, email: `${name.toLowerCase()}@example.com` });

function signIn(_id: string, role: AuthUser["role"]) {
  vi.mocked(verifyAuth).mockResolvedValue({ _id, email: "x@example.com", name: "X", role });
}

function chain(result: unknown) {
  const query = {
    populate: vi.fn(() => query),
    select: vi.fn(() => query),
    sort: vi.fn(() => query),
    limit: vi.fn(() => query),
    lean: vi.fn().mockResolvedValue(result),
  };
  return query;
}

const storedTrip = {
  _id: oid(GOA),
  name: "Goa offsite",
  purpose: "Sales kickoff",
  destinations: ["Goa"],
  startDate: new Date("2026-10-12T00:00:00.000Z"),
  endDate: new Date("2026-10-15T00:00:00.000Z"),
  travelers: [oid(ASHA), oid(RAVI)],
  department: null,
  budget: 50000,
  notes: "",
  createdBy: oid(RAVI),
};

const populatedTrip = {
  ...storedTrip,
  travelers: [person(ASHA, "Asha"), person(RAVI, "Ravi")],
  createdBy: person(RAVI, "Ravi"),
};

// The trip's expenses; find() and aggregate() run over them for real with mingo.
const flight = {
  _id: oid("66c1884c0853f8a76a4da501"),
  trip: oid(GOA),
  createdBy: oid(ASHA),
  date: new Date("2026-09-01T00:00:00.000Z"),
  amount: 100,
  amountInBaseCurrency: 8300,
  paymentSource: "pocket",
  pocketAmountInBaseCurrency: 8300,
  travelType: "flight",
};
const hotel = {
  _id: oid("66c1884c0853f8a76a4da502"),
  trip: oid(GOA),
  createdBy: oid(RAVI),
  date: new Date("2026-10-12T00:00:00.000Z"),
  amount: 6000,
  amountInBaseCurrency: 6000,
  paymentSource: "company",
  pocketAmountInBaseCurrency: 0,
  travelType: "stay",
};
const dinner = {
  _id: oid("66c1884c0853f8a76a4da503"),
  trip: oid(GOA),
  createdBy: oid(ASHA),
  date: new Date("2026-10-13T00:00:00.000Z"),
  amount: 3000,
  amountInBaseCurrency: 3000,
  paymentSource: "multiple",
  pocketAmountInBaseCurrency: 1000,
  payments: [
    { paidBy: oid(ASHA), amount: 1000, amountInBaseCurrency: 1000, source: "pocket" },
    { paidBy: oid(RAVI), amount: 2000, amountInBaseCurrency: 2000, source: "company" },
  ],
  travelType: null,
};
const elsewhere = { ...dinner, _id: oid("66c1884c0853f8a76a4da504"), trip: null };
const expenses = [flight, hotel, dinner, elsewhere];

const params = (id = GOA) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(connectDB).mockResolvedValue(undefined as never);
  vi.mocked(Expense.find).mockImplementation(
    ((filter: Record<string, unknown>) => chain(new Query(filter).find(expenses).all())) as never
  );
  vi.mocked(Expense.aggregate).mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((pipeline: any[]) => Promise.resolve(new Aggregator(pipeline).run(expenses))) as never
  );
  vi.mocked(Asset.aggregate).mockResolvedValue([{ _id: hotel._id, count: 2 }] as never);
  vi.mocked(User.find).mockReturnValue(chain([person(ASHA, "Asha"), person(RAVI, "Ravi")]) as never);
});

describe("GET /api/trips/:id", () => {
  beforeEach(() => {
    vi.mocked(Trip.findById).mockReturnValue(chain(populatedTrip) as never);
  });

  it("rejects an invalid id and a missing trip", async () => {
    signIn(ADMIN, "admin");
    expect((await GET({} as NextRequest, params("nope"))).status).toBe(400);

    vi.mocked(Trip.findById).mockReturnValue(chain(null) as never);
    const response = await GET({} as NextRequest, params());
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Trip not found" });
  });

  it("keeps people who aren't on the trip out", async () => {
    signIn(OUTSIDER, "user");
    const response = await GET({} as NextRequest, params());
    expect(response.status).toBe(403);
    expect(Expense.find).not.toHaveBeenCalled();
  });

  it("gives an admin every expense, oldest first, with totals and per-payer shares", async () => {
    signIn(ADMIN, "admin");
    const response = await GET({} as NextRequest, params());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect((vi.mocked(Expense.find).mock.calls[0] as unknown[])[0]).toEqual({ trip: oid(GOA) });
    const query = vi.mocked(Expense.find).mock.results[0].value;
    expect(query.sort).toHaveBeenCalledWith({ date: 1, createdAt: 1, _id: 1 });
    expect(query.populate).toHaveBeenCalledWith("trip", "name");
    expect(body.expenses.map((expense: { _id: string }) => expense._id)).toEqual(
      [flight, hotel, dinner].map((expense) => String(expense._id))
    );
    expect(body.expenses[1].linkedAssetCount).toBe(2);

    expect(body.summary).toEqual({
      totalAmount: 17300,
      expenseCount: 3,
      pocketAmount: 9300,
      companyAmount: 8000,
      byType: [
        { travelType: "flight", total: 8300, count: 1 },
        { travelType: "stay", total: 6000, count: 1 },
        { travelType: null, total: 3000, count: 1 },
      ],
      byPayer: [
        {
          user: { _id: ASHA, name: "Asha", email: "asha@example.com" },
          totalSpend: 9300,
          pocketSpend: 9300,
          companySpend: 0,
        },
        {
          user: { _id: RAVI, name: "Ravi", email: "ravi@example.com" },
          totalSpend: 8000,
          pocketSpend: 0,
          companySpend: 8000,
        },
      ],
    });
    expect(body.trip).toEqual(
      expect.objectContaining({ _id: GOA, expenseCount: 3, totalAmount: 17300, canManage: true })
    );
  });

  it("shows a traveler only their own expenses and totals", async () => {
    signIn(ASHA, "user");
    const body = await (await GET({} as NextRequest, params())).json();

    expect((vi.mocked(Expense.find).mock.calls[0] as unknown[])[0]).toEqual({ createdBy: oid(ASHA), trip: oid(GOA) });
    expect(body.expenses.map((expense: { _id: string }) => expense._id)).toEqual(
      [flight, dinner].map((expense) => String(expense._id))
    );
    expect(body.summary).toEqual(
      expect.objectContaining({ totalAmount: 11300, expenseCount: 2, pocketAmount: 9300, companyAmount: 2000 })
    );
    // Ravi paid part of Asha's dinner, so he is credited with that share.
    expect(body.summary.byPayer.map((row: { user: { _id: string }; totalSpend: number }) => [row.user._id, row.totalSpend])).toEqual([
      [ASHA, 9300],
      [RAVI, 2000],
    ]);
    expect(body.trip).toEqual(expect.objectContaining({ expenseCount: 2, totalAmount: 11300, canManage: false }));
  });

  it("reports zero totals for a trip without visible expenses", async () => {
    signIn(OUTSIDER, "admin");
    vi.mocked(Expense.find).mockReturnValue(chain([]) as never);
    vi.mocked(Expense.aggregate).mockResolvedValue([{ totals: [], byPayer: [] }] as never);

    const body = await (await GET({} as NextRequest, params())).json();

    expect(body.summary).toEqual({
      totalAmount: 0,
      expenseCount: 0,
      pocketAmount: 0,
      companyAmount: 0,
      byType: [],
      byPayer: [],
    });
    expect(Asset.aggregate).not.toHaveBeenCalled();
    expect(User.find).not.toHaveBeenCalled();
  });
});

describe("PUT /api/trips/:id", () => {
  function put(body: unknown) {
    return PUT({ json: async () => body } as unknown as NextRequest, params());
  }

  beforeEach(() => {
    // First call: the stored trip; later: the populated reload.
    vi.mocked(Trip.findById)
      .mockReturnValueOnce(chain(storedTrip) as never)
      .mockReturnValue(chain({ ...populatedTrip, name: "Goa offsite 2026" }) as never);
    vi.mocked(Trip.findByIdAndUpdate).mockResolvedValue({ _id: oid(GOA) } as never);
    vi.mocked(User.countDocuments).mockResolvedValue(2 as never);
  });

  it("lets only the creator or an admin change the trip", async () => {
    signIn(ASHA, "user");
    const response = await put({ name: "Mine now" });

    expect(response.status).toBe(403);
    expect(Trip.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it("merges a partial update onto the stored trip", async () => {
    signIn(RAVI, "user");
    const response = await put({ name: "Goa offsite 2026", createdBy: ASHA });

    expect(response.status).toBe(200);
    const [id, update] = vi.mocked(Trip.findByIdAndUpdate).mock.calls[0] as unknown as [
      string,
      { $set: Record<string, unknown> },
    ];
    expect(id).toBe(GOA);
    expect(update.$set).toEqual({
      name: "Goa offsite 2026",
      purpose: "Sales kickoff",
      destinations: ["Goa"],
      startDate: storedTrip.startDate,
      endDate: storedTrip.endDate,
      travelers: [oid(ASHA), oid(RAVI)],
      department: null,
      budget: 50000,
      notes: "",
    });
    expect((await response.json()).trip).toEqual(
      expect.objectContaining({ name: "Goa offsite 2026", canManage: true })
    );
  });

  it("re-validates the merged trip", async () => {
    signIn(ADMIN, "admin");
    const response = await put({ endDate: "2026-10-01" });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "End date cannot be before the start date" });
    expect(Trip.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing trip", async () => {
    signIn(ADMIN, "admin");
    vi.mocked(Trip.findById).mockReset().mockReturnValue(chain(null) as never);
    expect((await put({ name: "x" })).status).toBe(404);
  });
});

describe("DELETE /api/trips/:id", () => {
  beforeEach(() => {
    vi.mocked(Trip.findById).mockReturnValue(chain(storedTrip) as never);
    vi.mocked(Expense.updateMany).mockResolvedValue({ matchedCount: 3 } as never);
    vi.mocked(Trip.deleteOne).mockResolvedValue({ deletedCount: 1 } as never);
  });

  it("refuses travelers who didn't create the trip", async () => {
    signIn(ASHA, "user");
    expect((await DELETE({} as NextRequest, params())).status).toBe(403);
    expect(Expense.updateMany).not.toHaveBeenCalled();
    expect(Trip.deleteOne).not.toHaveBeenCalled();
  });

  it("unlinks every expense of the trip, then deletes only the trip", async () => {
    signIn(RAVI, "user");
    const response = await DELETE({} as NextRequest, params());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ message: "Trip deleted" });
    // Not scoped to the caller: everyone's expenses leave the trip.
    expect(Expense.updateMany).toHaveBeenCalledWith(
      { trip: oid(GOA) },
      { $set: { trip: null, travelType: null } }
    );
    expect(Trip.deleteOne).toHaveBeenCalledWith({ _id: oid(GOA) });
    expect(vi.mocked(Expense.updateMany).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(Trip.deleteOne).mock.invocationCallOrder[0]
    );
  });

  it("returns 404 for a missing trip", async () => {
    signIn(ADMIN, "admin");
    vi.mocked(Trip.findById).mockReturnValue(chain(null) as never);
    expect((await DELETE({} as NextRequest, params())).status).toBe(404);
  });
});
