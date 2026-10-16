import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { verifyAuth } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import Department from "@/models/Department";

vi.mock("@/lib/auth", () => ({ verifyAuth: vi.fn() }));
vi.mock("@/lib/mongodb", () => ({ connectDB: vi.fn() }));

function chain(result: unknown) {
  const query = {
    select: vi.fn(() => query),
    sort: vi.fn(() => query),
    lean: vi.fn().mockResolvedValue(result),
  };
  return query;
}

vi.mock("@/models/User", () => ({ default: { find: vi.fn() } }));
vi.mock("@/models/Department", () => ({ default: { find: vi.fn() } }));
vi.mock("@/models/Category", () => ({ default: { find: vi.fn() } }));
vi.mock("@/models/Currency", () => ({ default: { find: vi.fn() } }));

function get(query: string) {
  return GET({ url: `http://localhost/api/lookups${query}` } as NextRequest);
}

describe("GET /api/lookups members", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(connectDB).mockResolvedValue(undefined as never);
  });

  it("gives any signed-in role the payer list with only id, name and email", async () => {
    vi.mocked(verifyAuth).mockResolvedValue({
      _id: "user-id",
      email: "user@example.com",
      name: "User",
      role: "user",
    });
    const members = [{ _id: "u1", name: "Asha", email: "asha@example.com" }];
    const query = chain(members);
    vi.mocked(User.find).mockReturnValue(query as never);

    const response = await get("?include=members");

    expect(response.status).toBe(200);
    // Locks the exposed fields: role, firebaseUid and photoURL must stay off this list.
    expect(query.select).toHaveBeenCalledWith("name email");
    expect(await response.json()).toEqual({ departments: [], categories: [], currencies: [], members });
  });

  it("doesn't load members unless asked", async () => {
    vi.mocked(verifyAuth).mockResolvedValue({
      _id: "user-id",
      email: "user@example.com",
      name: "User",
      role: "user",
    });
    vi.mocked(Department.find).mockReturnValue(chain([]) as never);

    const response = await get("?include=departments");

    expect(User.find).not.toHaveBeenCalled();
    expect((await response.json()).members).toEqual([]);
  });
});
