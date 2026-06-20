import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { GET } from "./route";
import { verifyAuth, requireAdmin } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import Expense from "@/models/Expense";

vi.mock("@/lib/auth", () => ({
  verifyAuth: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock("@/lib/mongodb", () => ({
  connectDB: vi.fn(),
}));

vi.mock("@/models/User", () => {
  const lean = vi.fn();
  const sort = vi.fn(() => ({ lean }));
  const select = vi.fn(() => ({ sort }));
  const find = vi.fn(() => ({ select }));
  return { default: { find }, __mockChain: { select, sort, lean } };
});

vi.mock("@/models/Expense", () => ({
  default: {
    aggregate: vi.fn(),
  },
}));

// Mock NextResponse
vi.mock("next/server", () => {
  class MockNextResponse {
    static json = vi.fn((data, init) => ({ data, init }));
  }
  return {
    NextResponse: MockNextResponse,
  };
});

describe("GET /api/users", () => {
  const mockReq = {} as NextRequest;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return auth error if verifyAuth fails", async () => {
    const errorResponse = new NextResponse();
    vi.mocked(verifyAuth).mockResolvedValueOnce(errorResponse as any);

    const result = await GET(mockReq);
    expect(result).toBe(errorResponse);
  });

  it("should return admin error if requireAdmin fails", async () => {
    vi.mocked(verifyAuth).mockResolvedValueOnce({ uid: "user-123" } as any);
    const errorResponse = new NextResponse();
    vi.mocked(requireAdmin).mockReturnValueOnce(errorResponse as any);

    const result = await GET(mockReq);
    expect(result).toBe(errorResponse);
  });

  it("should fetch users and aggregate spend successfully", async () => {
    vi.mocked(verifyAuth).mockResolvedValueOnce({ uid: "admin-123", role: "admin" } as any);
    vi.mocked(requireAdmin).mockReturnValueOnce(null);

    const mockUsers = [
      { _id: "u1", name: "User 1", email: "u1@test.com" },
      { _id: "u2", name: "User 2", email: "u2@test.com" },
    ];
    
    // We need to access the chained mock methods dynamically
    const UserMock = await import("@/models/User");
    const { lean } = (UserMock as any).__mockChain;
    lean.mockResolvedValueOnce(mockUsers);

    vi.mocked(Expense.aggregate).mockResolvedValueOnce([
      { _id: "u1", totalSpend: 500 },
      // u2 has no spend
    ]);

    const result = await GET(mockReq);

    expect(connectDB).toHaveBeenCalled();
    expect(User.find).toHaveBeenCalled();
    expect(Expense.aggregate).toHaveBeenCalled();

    expect(NextResponse.json).toHaveBeenCalledWith({
      users: [
        { ...mockUsers[0], totalSpend: 500 },
        { ...mockUsers[1], totalSpend: 0 },
      ],
    });
    
    // Check that we got the mocked result object back from our NextRespose mock
    expect((result as any).data.users).toHaveLength(2);
    expect((result as any).data.users[0].totalSpend).toBe(500);
    expect((result as any).data.users[1].totalSpend).toBe(0);
  });
});
