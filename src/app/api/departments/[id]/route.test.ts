import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { DELETE } from "./route";
import { verifyAuth } from "@/lib/auth";
import Department from "@/models/Department";
import Expense from "@/models/Expense";
import Asset from "@/models/Asset";
import AssetAssignment from "@/models/AssetAssignment";
import Trip from "@/models/Trip";

vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  verifyAuth: vi.fn(),
}));
vi.mock("@/lib/mongodb", () => ({ connectDB: vi.fn() }));
vi.mock("@/lib/firebase-admin", () => ({ adminAuth: {} }));
vi.mock("@/models/Department", () => ({ default: { findById: vi.fn(), findByIdAndDelete: vi.fn() } }));
vi.mock("@/models/Expense", () => ({ default: { countDocuments: vi.fn() } }));
vi.mock("@/models/Asset", () => ({ default: { countDocuments: vi.fn() } }));
vi.mock("@/models/AssetAssignment", () => ({ default: { countDocuments: vi.fn() } }));
vi.mock("@/models/Trip", () => ({ default: { updateMany: vi.fn() } }));

const DEPT = "66c1884c0853f8a76a4da301";

function del() {
  return DELETE({} as NextRequest, { params: Promise.resolve({ id: DEPT }) });
}

describe("DELETE /api/departments/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAuth).mockResolvedValue({ _id: "a", email: "a@example.com", name: "A", role: "admin" });
    vi.mocked(Department.findById).mockResolvedValue({ _id: DEPT, isDefault: false } as never);
    vi.mocked(Asset.countDocuments).mockResolvedValue(0 as never);
    vi.mocked(AssetAssignment.countDocuments).mockResolvedValue(0 as never);
  });

  it("clears the department from trips that used it as their default", async () => {
    vi.mocked(Expense.countDocuments).mockResolvedValue(0 as never);

    const response = await del();

    expect(response.status).toBe(200);
    expect(Department.findByIdAndDelete).toHaveBeenCalledWith(DEPT);
    expect(Trip.updateMany).toHaveBeenCalledWith({ department: DEPT }, { $set: { department: null } });
  });

  it("leaves trips alone when the department can't be deleted", async () => {
    vi.mocked(Expense.countDocuments).mockResolvedValue(2 as never);

    expect((await del()).status).toBe(400);
    expect(Trip.updateMany).not.toHaveBeenCalled();
  });
});
