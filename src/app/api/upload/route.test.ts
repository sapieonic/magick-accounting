import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { verifyAuth } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { getDownloadUrl } from "@/lib/s3";
import Expense from "@/models/Expense";

vi.mock("@/lib/auth", () => ({ verifyAuth: vi.fn() }));
vi.mock("@/lib/mongodb", () => ({ connectDB: vi.fn() }));
vi.mock("@/lib/s3", () => ({
  uploadObject: vi.fn(),
  getDownloadUrl: vi.fn(),
  deleteObject: vi.fn(),
}));
vi.mock("@/models/Expense", () => ({
  default: { findOne: vi.fn(), exists: vi.fn() },
}));

function mockExpenseLookup(value: unknown) {
  vi.mocked(Expense.findOne).mockReturnValue({
    select: vi.fn(() => ({ lean: vi.fn().mockResolvedValue(value) })),
  } as never);
}

describe("GET /api/upload receipt authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(connectDB).mockResolvedValue(undefined);
  });

  it("does not issue a signed URL to an unrelated regular user", async () => {
    vi.mocked(verifyAuth).mockResolvedValue({
      _id: "user-2",
      email: "two@example.com",
      name: "Two",
      role: "user",
    });
    mockExpenseLookup({ createdBy: "user-1" });

    const response = await GET({ url: "http://localhost/api/upload?key=receipts/key.pdf" } as NextRequest);
    expect(response.status).toBe(403);
    expect(getDownloadUrl).not.toHaveBeenCalled();
  });

  it("allows the expense owner to open the receipt", async () => {
    vi.mocked(verifyAuth).mockResolvedValue({
      _id: "user-1",
      email: "one@example.com",
      name: "One",
      role: "user",
    });
    mockExpenseLookup({ createdBy: "user-1" });
    vi.mocked(getDownloadUrl).mockResolvedValue("https://signed.example/receipt");

    const response = await GET({ url: "http://localhost/api/upload?key=receipts/key.pdf" } as NextRequest);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      downloadUrl: "https://signed.example/receipt",
    });
  });
});
