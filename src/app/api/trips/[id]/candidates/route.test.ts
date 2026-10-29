import { beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { Query } from "mingo";
import "mingo/init/system";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { verifyAuth, type AuthUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Trip from "@/models/Trip";
import Expense from "@/models/Expense";
import Asset from "@/models/Asset";

vi.mock("@/lib/auth", () => ({ verifyAuth: vi.fn() }));
vi.mock("@/lib/mongodb", () => ({ connectDB: vi.fn() }));
vi.mock("@/models/Trip", () => ({ default: { findById: vi.fn() } }));
vi.mock("@/models/Expense", () => ({ default: { find: vi.fn() } }));
vi.mock("@/models/Asset", () => ({ default: { aggregate: vi.fn() } }));
vi.mock("@/models/User", () => ({ default: {} }));
vi.mock("@/models/Department", () => ({ default: {} }));
vi.mock("@/models/Category", () => ({ default: {} }));
vi.mock("@/models/Currency", () => ({ default: {} }));

const ASHA = "66c1884c0853f8a76a4da201";
const RAVI = "66c1884c0853f8a76a4da202";
const ADMIN = "66c1884c0853f8a76a4da203";
const OUTSIDER = "66c1884c0853f8a76a4da204";
const GOA = "66c1884c0853f8a76a4da301";
const OTHER_TRIP = "66c1884c0853f8a76a4da302";

const oid = (id: string) => new mongoose.Types.ObjectId(id);

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

let counter = 0;
function expense(title: string, day: string, createdBy: string, trip: string | null = null) {
  counter += 1;
  return {
    _id: new mongoose.Types.ObjectId(),
    title,
    description: "",
    date: new Date(`${day}T00:00:00.000Z`),
    createdBy: oid(createdBy),
    trip: trip ? oid(trip) : null,
    amount: counter,
  };
}

// Trip runs 12–15 Oct 2026: candidates are dated 13 Aug .. 29 Oct.
const earlyFlight = expense("Flight GOI", "2026-08-13", ASHA);
const tooEarly = expense("Old flight", "2026-08-12", ASHA);
const ravisCab = expense("Cab (airport)", "2026-10-14", RAVI);
const lateRefund = expense("Hotel extra", "2026-10-29", ASHA);
const tooLate = expense("Late lunch", "2026-10-30", ASHA);
const inAnotherTrip = expense("Train", "2026-10-13", ASHA, OTHER_TRIP);
const outsiders = expense("Dinner", "2026-10-13", OUTSIDER);
const admins = expense("Visa for Asha", "2026-09-01", ADMIN);
const docs = [earlyFlight, tooEarly, ravisCab, lateRefund, tooLate, inAnotherTrip, outsiders, admins];

function get(query = "", id = GOA) {
  return GET({ url: `http://localhost/api/trips/${id}/candidates${query}` } as NextRequest, {
    params: Promise.resolve({ id }),
  });
}

const titles = (body: { expenses: { title: string }[] }) => body.expenses.map((e) => e.title).sort();

describe("GET /api/trips/:id/candidates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(connectDB).mockResolvedValue(undefined as never);
    vi.mocked(Trip.findById).mockReturnValue(
      chain({
        _id: oid(GOA),
        startDate: new Date("2026-10-12T00:00:00.000Z"),
        endDate: new Date("2026-10-15T00:00:00.000Z"),
        travelers: [oid(ASHA), oid(RAVI)],
        createdBy: oid(ADMIN),
      }) as never
    );
    vi.mocked(Expense.find).mockImplementation(
      ((filter: Record<string, unknown>) => chain(new Query(filter).find(docs).all())) as never
    );
    vi.mocked(Asset.aggregate).mockResolvedValue([] as never);
  });

  it("keeps people who aren't on the trip out", async () => {
    signIn(OUTSIDER, "user");
    expect((await get()).status).toBe(403);
    expect(Expense.find).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing trip", async () => {
    signIn(ADMIN, "admin");
    vi.mocked(Trip.findById).mockReturnValue(chain(null) as never);
    expect((await get()).status).toBe(404);
  });

  it("offers an admin the travelers' (and their own) unassigned expenses around the trip", async () => {
    signIn(ADMIN, "admin");
    const response = await get();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(titles(body)).toEqual(["Cab (airport)", "Flight GOI", "Hotel extra", "Visa for Asha"].sort());
    expect(body.truncated).toBe(false);
    const query = vi.mocked(Expense.find).mock.results[0].value;
    // Newest first, so a long tail of early bookings can't crowd out the trip itself.
    expect(query.sort).toHaveBeenCalledWith({ date: -1, createdAt: -1, _id: -1 });
    expect(query.limit).toHaveBeenCalledWith(101);
    expect(query.populate).toHaveBeenCalledWith("trip", "name");
    const filter = (vi.mocked(Expense.find).mock.calls[0] as unknown[])[0] as { date: { $gte: Date; $lte: Date } };
    expect(filter.date.$gte.toISOString()).toBe("2026-08-13T00:00:00.000Z");
    expect(filter.date.$lte.toISOString()).toBe("2026-10-29T23:59:59.999Z");
  });

  it("offers a traveler only their own expenses", async () => {
    signIn(ASHA, "user");
    expect(titles(await (await get()).json())).toEqual(["Flight GOI", "Hotel extra"]);
  });

  it("caps the list at 100 and says it was cut off", async () => {
    signIn(ADMIN, "admin");
    const many = Array.from({ length: 101 }, (_, i) => expense(`Bill ${i}`, "2026-10-13", ADMIN));
    vi.mocked(Expense.find).mockReturnValue(chain(many) as never);

    const body = await (await get()).json();

    expect(body.expenses).toHaveLength(100);
    expect(body.truncated).toBe(true);
  });

  it("searches titles with the input escaped", async () => {
    signIn(ADMIN, "admin");
    expect(titles(await (await get("?search=cab%20(")).json())).toEqual(["Cab (airport)"]);
    expect(titles(await (await get("?search=c.b")).json())).toEqual([]);
  });
});
