import { beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { NextRequest } from "next/server";
import { PATCH } from "./route";
import { verifyAuth, type AuthUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Trip from "@/models/Trip";
import Expense from "@/models/Expense";

vi.mock("@/lib/auth", () => ({ verifyAuth: vi.fn() }));
vi.mock("@/lib/mongodb", () => ({ connectDB: vi.fn() }));
vi.mock("@/models/Trip", () => ({ default: { findById: vi.fn() } }));
vi.mock("@/models/Expense", () => ({ default: { exists: vi.fn(), updateMany: vi.fn() } }));
vi.mock("@/models/Asset", () => ({ default: {} }));
vi.mock("@/models/User", () => ({ default: {} }));
vi.mock("@/models/Department", () => ({ default: {} }));
vi.mock("@/models/Category", () => ({ default: {} }));
vi.mock("@/models/Currency", () => ({ default: {} }));

const ASHA = "66c1884c0853f8a76a4da201";
const RAVI = "66c1884c0853f8a76a4da202";
const ADMIN = "66c1884c0853f8a76a4da203";
const OUTSIDER = "66c1884c0853f8a76a4da204";
const GOA = "66c1884c0853f8a76a4da301";
const E1 = "66c1884c0853f8a76a4da501";
const E2 = "66c1884c0853f8a76a4da502";

const oid = (id: string) => new mongoose.Types.ObjectId(id);

function signIn(_id: string, role: AuthUser["role"]) {
  vi.mocked(verifyAuth).mockResolvedValue({ _id, email: "x@example.com", name: "X", role });
}

function chain(result: unknown) {
  const query = { select: vi.fn(() => query), lean: vi.fn().mockResolvedValue(result) };
  return query;
}

function patch(body: unknown, id = GOA) {
  return PATCH({ json: async () => body } as unknown as NextRequest, {
    params: Promise.resolve({ id }),
  });
}

describe("PATCH /api/trips/:id/expenses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(connectDB).mockResolvedValue(undefined as never);
    vi.mocked(Trip.findById).mockReturnValue(
      chain({ _id: oid(GOA), travelers: [oid(ASHA)], createdBy: oid(RAVI) }) as never
    );
    vi.mocked(Expense.exists).mockResolvedValue(null as never);
    vi.mocked(Expense.updateMany).mockResolvedValue({ matchedCount: 1, modifiedCount: 1 } as never);
  });

  it("validates the lists before loading anything", async () => {
    signIn(ADMIN, "admin");

    const cases: [unknown, string][] = [
      [{}, "Choose at least one expense to add or remove"],
      [{ add: [], remove: [] }, "Choose at least one expense to add or remove"],
      [{ add: E1 }, '"add" must be a list of expense ids'],
      [{ remove: ["nope"] }, "Expense id is invalid"],
      [{ add: Array.from({ length: 201 }, () => E1) }, "You can move at most 200 expenses at a time"],
      [{ add: [E1], remove: [E1.toUpperCase()] }, "An expense cannot be both added to and removed from the trip"],
    ];
    for (const [body, error] of cases) {
      const response = await patch(body);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error });
    }
    expect((await patch({ add: [E1] }, "nope")).status).toBe(400);
    expect(Trip.findById).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing trip and 403 for someone not on it", async () => {
    signIn(OUTSIDER, "user");
    expect((await patch({ add: [E1] })).status).toBe(403);

    vi.mocked(Trip.findById).mockReturnValue(chain(null) as never);
    expect((await patch({ add: [E1] })).status).toBe(404);
    expect(Expense.updateMany).not.toHaveBeenCalled();
  });

  it("lets a user move only their own expenses", async () => {
    signIn(ASHA, "user");
    vi.mocked(Expense.exists).mockResolvedValue({ _id: oid(E2) } as never);

    const response = await patch({ add: [E1], remove: [E2] });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "You can only move your own expenses" });
    expect(Expense.exists).toHaveBeenCalledWith({
      _id: { $in: [oid(E1), oid(E2)] },
      createdBy: { $ne: oid(ASHA) },
    });
    expect(Expense.updateMany).not.toHaveBeenCalled();
  });

  it("adds a user's own expenses (even from another trip) and removes them from this trip only", async () => {
    signIn(ASHA, "user");
    vi.mocked(Expense.updateMany)
      .mockResolvedValueOnce({ matchedCount: 1 } as never)
      .mockResolvedValueOnce({ matchedCount: 2 } as never);

    const response = await patch({ add: [E1, E1.toUpperCase()], remove: [E2] });

    expect(response.status).toBe(200);
    expect(Expense.updateMany).toHaveBeenCalledWith(
      { _id: { $in: [oid(E2)] }, trip: oid(GOA), createdBy: oid(ASHA) },
      { $set: { trip: null, travelType: null } }
    );
    expect(Expense.updateMany).toHaveBeenCalledWith(
      { _id: { $in: [oid(E1)] }, createdBy: oid(ASHA) },
      { $set: { trip: oid(GOA) } }
    );
    expect(await response.json()).toEqual({ added: 2, removed: 1 });
  });

  it("lets the creator who isn't traveling, or an admin, move anyone's expenses", async () => {
    signIn(ADMIN, "admin");
    const response = await patch({ add: [E1, E2] });

    expect(response.status).toBe(200);
    expect(Expense.exists).not.toHaveBeenCalled();
    expect(Expense.updateMany).toHaveBeenCalledTimes(1);
    expect(Expense.updateMany).toHaveBeenCalledWith(
      { _id: { $in: [oid(E1), oid(E2)] } },
      { $set: { trip: oid(GOA) } }
    );
    expect(await response.json()).toEqual({ added: 1, removed: 0 });

    // A `user`-role creator can see the trip, but still only moves their own.
    vi.clearAllMocks();
    vi.mocked(Expense.exists).mockResolvedValue(null as never);
    vi.mocked(Expense.updateMany).mockResolvedValue({ matchedCount: 1 } as never);
    signIn(RAVI, "user");
    expect((await patch({ remove: [E1] })).status).toBe(200);
    expect(Expense.updateMany).toHaveBeenCalledWith(
      { _id: { $in: [oid(E1)] }, trip: oid(GOA), createdBy: oid(RAVI) },
      { $set: { trip: null, travelType: null } }
    );
  });
});
