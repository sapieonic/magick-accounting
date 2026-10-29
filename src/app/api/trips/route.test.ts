import { beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { Aggregator } from "mingo";
import "mingo/init/system";
import { NextRequest, NextResponse } from "next/server";
import { GET, POST } from "./route";
import { verifyAuth, type AuthUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Trip from "@/models/Trip";
import Expense from "@/models/Expense";
import User from "@/models/User";
import Department from "@/models/Department";

vi.mock("@/lib/auth", () => ({ verifyAuth: vi.fn() }));
vi.mock("@/lib/mongodb", () => ({ connectDB: vi.fn() }));
vi.mock("@/models/Trip", () => ({ default: { find: vi.fn(), findById: vi.fn(), create: vi.fn() } }));
vi.mock("@/models/Expense", () => ({ default: { aggregate: vi.fn() } }));
vi.mock("@/models/Asset", () => ({ default: { aggregate: vi.fn() } }));
vi.mock("@/models/User", () => ({ default: { countDocuments: vi.fn(), find: vi.fn() } }));
vi.mock("@/models/Department", () => ({ default: { exists: vi.fn() } }));
vi.mock("@/models/Category", () => ({ default: {} }));
vi.mock("@/models/Currency", () => ({ default: {} }));

const ASHA = "66c1884c0853f8a76a4da201";
const RAVI = "66c1884c0853f8a76a4da202";
const ADMIN = "66c1884c0853f8a76a4da203";
const GOA = "66c1884c0853f8a76a4da301";
const PUNE = "66c1884c0853f8a76a4da302";

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
    lean: vi.fn().mockResolvedValue(result),
  };
  return query;
}

// Stored expenses the totals aggregation runs over, for real, with mingo.
const expenses = [
  { _id: new mongoose.Types.ObjectId(), trip: oid(GOA), createdBy: oid(ASHA), amount: 100, amountInBaseCurrency: 8300 },
  { _id: new mongoose.Types.ObjectId(), trip: oid(GOA), createdBy: oid(RAVI), amount: 1200 },
  { _id: new mongoose.Types.ObjectId(), trip: oid(GOA), createdBy: oid(ASHA), amount: 450.5, amountInBaseCurrency: 450.5 },
  { _id: new mongoose.Types.ObjectId(), trip: null, createdBy: oid(ASHA), amount: 999 },
];

const goaTrip = {
  _id: oid(GOA),
  name: "Goa offsite",
  purpose: "Sales kickoff",
  destinations: ["Goa"],
  startDate: new Date("2026-10-12T00:00:00.000Z"),
  endDate: new Date("2026-10-15T00:00:00.000Z"),
  travelers: [person(ASHA, "Asha"), person(RAVI, "Ravi")],
  department: { _id: oid("66c1884c0853f8a76a4da401"), name: "Sales" },
  budget: 50000,
  notes: "",
  createdBy: person(RAVI, "Ravi"),
};

const puneTrip = {
  ...goaTrip,
  _id: oid(PUNE),
  name: "Pune audit",
  destinations: ["Pune"],
  startDate: new Date("2026-01-05T00:00:00.000Z"),
  endDate: new Date("2026-01-06T00:00:00.000Z"),
  travelers: [person(RAVI, "Ravi")],
  department: null,
  budget: null,
};

function get(query = "") {
  return GET({ url: `http://localhost/api/trips${query}` } as NextRequest);
}

function post(body: unknown) {
  return POST({ json: async () => body } as unknown as NextRequest);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(connectDB).mockResolvedValue(undefined as never);
  vi.mocked(Expense.aggregate).mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((pipeline: any[]) => Promise.resolve(new Aggregator(pipeline).run(expenses))) as never
  );
});

describe("GET /api/trips", () => {
  it("returns the auth error untouched", async () => {
    const denied = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    vi.mocked(verifyAuth).mockResolvedValue(denied);
    expect(await get()).toBe(denied);
    expect(Trip.find).not.toHaveBeenCalled();
  });

  it("shows admins every trip with the totals of all its expenses", async () => {
    signIn(ADMIN, "admin");
    const query = chain([goaTrip, puneTrip]);
    vi.mocked(Trip.find).mockReturnValue(query as never);

    const response = await get();
    const { trips } = await response.json();

    expect(Trip.find).toHaveBeenCalledWith({});
    expect(query.sort).toHaveBeenCalledWith({ startDate: -1, createdAt: -1 });
    expect(query.populate).toHaveBeenCalledWith("travelers", "name email photoURL");
    expect(trips[0]).toEqual(
      expect.objectContaining({
        _id: GOA,
        name: "Goa offsite",
        startDate: "2026-10-12T00:00:00.000Z",
        expenseCount: 3,
        totalAmount: 9950.5,
        canManage: true,
        department: { _id: "66c1884c0853f8a76a4da401", name: "Sales" },
        createdBy: { _id: RAVI, name: "Ravi", email: "ravi@example.com" },
      })
    );
    expect(trips[0].travelers.map((traveler: { _id: string }) => traveler._id)).toEqual([ASHA, RAVI]);
    expect(["upcoming", "ongoing", "completed"]).toContain(trips[0].status);
    expect(trips[1]).toEqual(
      expect.objectContaining({ _id: PUNE, expenseCount: 0, totalAmount: 0, status: "completed", department: null })
    );
  });

  it("shows a user only their trips, totalled over their own expenses", async () => {
    signIn(ASHA, "user");
    vi.mocked(Trip.find).mockReturnValue(chain([goaTrip]) as never);

    const { trips } = await (await get()).json();

    expect(Trip.find).toHaveBeenCalledWith({ $or: [{ travelers: oid(ASHA) }, { createdBy: oid(ASHA) }] });
    expect(trips[0]).toEqual(
      expect.objectContaining({ expenseCount: 2, totalAmount: 8750.5, canManage: false })
    );
  });

  it("searches names and destinations with the input escaped", async () => {
    signIn(ASHA, "user");
    vi.mocked(Trip.find).mockReturnValue(chain([]) as never);

    const response = await get("?q=go.a");

    expect(response.status).toBe(200);
    const filter = (vi.mocked(Trip.find).mock.calls[0] as unknown[])[0] as { $and: Record<string, unknown>[] };
    expect(filter.$and[0]).toEqual({ $or: [{ travelers: oid(ASHA) }, { createdBy: oid(ASHA) }] });
    const [byName] = (filter.$and[1] as { $or: { name: RegExp }[] }).$or;
    expect(byName.name.test("go.a trip")).toBe(true);
    expect(byName.name.test("goxa")).toBe(false);
    expect(Expense.aggregate).not.toHaveBeenCalled();
  });
});

describe("POST /api/trips", () => {
  beforeEach(() => {
    signIn(ASHA, "user");
    vi.mocked(User.countDocuments).mockResolvedValue(1 as never);
    vi.mocked(Department.exists).mockResolvedValue({ _id: "d" } as never);
    vi.mocked(Trip.create).mockResolvedValue({ _id: oid(GOA) } as never);
    vi.mocked(Trip.findById).mockReturnValue(
      chain({ ...goaTrip, travelers: [person(ASHA, "Asha")], createdBy: person(ASHA, "Asha") }) as never
    );
  });

  it("lets anyone create a trip and makes them its traveler by default", async () => {
    const response = await post({ name: "Goa offsite", startDate: "2026-10-12", endDate: "2026-10-15", travelers: [] });

    expect(response.status).toBe(201);
    const created = vi.mocked(Trip.create).mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(created).toEqual(
      expect.objectContaining({
        name: "Goa offsite",
        startDate: new Date("2026-10-12T00:00:00.000Z"),
        endDate: new Date("2026-10-15T00:00:00.000Z"),
        travelers: [oid(ASHA)],
        createdBy: ASHA,
      })
    );
    const { trip } = await response.json();
    expect(trip).toEqual(expect.objectContaining({ _id: GOA, canManage: true, expenseCount: 2 }));
  });

  it("keeps the travelers the creator chose", async () => {
    vi.mocked(User.countDocuments).mockResolvedValue(2 as never);

    await post({ name: "Goa", startDate: "2026-10-12", endDate: "2026-10-15", travelers: [RAVI, ADMIN] });

    expect(User.countDocuments).toHaveBeenCalledWith({ _id: { $in: [RAVI, ADMIN] } });
    expect((vi.mocked(Trip.create).mock.calls[0][0] as unknown as { travelers: unknown }).travelers).toEqual([
      oid(RAVI),
      oid(ADMIN),
    ]);
  });

  it("rejects invalid input before writing", async () => {
    const response = await post({ name: "Goa", startDate: "2026-10-12", endDate: "2026-10-01" });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "End date cannot be before the start date" });
    expect(Trip.create).not.toHaveBeenCalled();
  });

  it("rejects travelers who aren't users", async () => {
    vi.mocked(User.countDocuments).mockResolvedValue(0 as never);

    const response = await post({ name: "Goa", startDate: "2026-10-12", endDate: "2026-10-15", travelers: [RAVI] });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "A traveler is not a user of this app" });
    expect(Trip.create).not.toHaveBeenCalled();
  });
});
