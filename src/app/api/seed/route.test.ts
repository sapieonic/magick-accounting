import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { POST } from "./route";
import { verifyAuth, type AuthUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Category from "@/models/Category";
import Currency from "@/models/Currency";
import Department from "@/models/Department";
import Expense from "@/models/Expense";
import AllowedDomain from "@/models/AllowedDomain";
import User from "@/models/User";

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, verifyAuth: vi.fn() };
});
vi.mock("@/lib/mongodb", () => ({ connectDB: vi.fn() }));
vi.mock("@/models/Category", () => ({
  default: { countDocuments: vi.fn(), insertMany: vi.fn() },
  DEFAULT_CATEGORIES: ["Travel"],
}));
vi.mock("@/models/Currency", () => ({
  default: { findOne: vi.fn(), insertMany: vi.fn() },
  DEFAULT_CURRENCIES: [{ code: "INR", isBase: true }],
}));
vi.mock("@/models/Department", () => ({ default: { findOne: vi.fn(), create: vi.fn() } }));
vi.mock("@/models/Expense", () => ({ default: { countDocuments: vi.fn(), updateMany: vi.fn() } }));
vi.mock("@/models/AllowedDomain", () => ({ default: { findOne: vi.fn(), create: vi.fn() } }));
vi.mock("@/models/User", () => ({ default: { findOne: vi.fn() } }));

const MASTER: AuthUser = { _id: "66c1884c0853f8a76a4da000", email: "m@x.com", name: "Mira", role: "master_admin" };
const ADMIN: AuthUser = { ...MASTER, _id: "66c1884c0853f8a76a4da001", role: "admin" };
const USER: AuthUser = { ...MASTER, _id: "66c1884c0853f8a76a4da101", role: "user" };
const req = {} as NextRequest;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(connectDB).mockResolvedValue(undefined as never);
  // Everything already exists, except one expense without a currency.
  vi.mocked(Category.countDocuments).mockResolvedValue(3 as never);
  vi.mocked(Department.findOne).mockResolvedValue({ _id: "d1" } as never);
  vi.mocked(AllowedDomain.findOne).mockResolvedValue({ _id: "ad1" } as never);
  vi.mocked(Currency.findOne).mockResolvedValue({ _id: "c1", isBase: true } as never);
  vi.mocked(User.findOne).mockResolvedValue({ _id: MASTER._id } as never);
  vi.mocked(Expense.countDocuments).mockResolvedValue(1 as never);
  vi.mocked(Expense.updateMany).mockResolvedValue({} as never);
});

describe("POST /api/seed", () => {
  it("refuses a request without a valid sign-in, touching nothing", async () => {
    vi.mocked(verifyAuth).mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));

    const response = await POST(req);

    expect(response.status).toBe(401);
    expect(connectDB).not.toHaveBeenCalled();
    expect(Expense.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ["an admin", ADMIN],
    ["a member", USER],
  ])("is master-admin only: %s gets a 403", async (_label, who) => {
    vi.mocked(verifyAuth).mockResolvedValue(who);

    const response = await POST(req);

    expect(response.status).toBe(403);
    expect(connectDB).not.toHaveBeenCalled();
  });

  it("seeds for the master admin, and its backfill bumps each expense's revision", async () => {
    vi.mocked(verifyAuth).mockResolvedValue(MASTER);

    const response = await POST(req);

    expect(response.status).toBe(200);
    const [filter, pipeline] = vi.mocked(Expense.updateMany).mock.calls[0] as unknown as [
      unknown,
      { $set: Record<string, unknown> }[],
    ];
    expect(filter).toEqual({ currency: null });
    expect(pipeline[0].$set.assetAllocationRevision).toEqual({
      $add: [{ $ifNull: ["$assetAllocationRevision", 0] }, 1],
    });
  });
});
