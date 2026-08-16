import mongoose from "mongoose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runInTransaction } from "@/lib/mongodb-transaction";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runInTransaction", () => {
  it("runs the operation in a supported transaction", async () => {
    const session = {
      withTransaction: vi.fn(async (callback: () => Promise<void>) => callback()),
      endSession: vi.fn().mockResolvedValue(undefined),
    };
    vi.spyOn(mongoose, "startSession").mockResolvedValue(session as never);
    const operation = vi.fn().mockResolvedValue("ok");

    await expect(runInTransaction(operation)).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledWith(session, true);
    expect(session.endSession).toHaveBeenCalledOnce();
  });

  it("uses the explicit standalone fallback for compensatable creation", async () => {
    const session = {
      withTransaction: vi.fn().mockRejectedValue(
        new Error("Transaction numbers are only allowed on a replica set member or mongos")
      ),
      endSession: vi.fn().mockResolvedValue(undefined),
    };
    vi.spyOn(mongoose, "startSession").mockResolvedValue(session as never);
    const operation = vi.fn().mockResolvedValue("fallback");

    await expect(runInTransaction(operation)).resolves.toBe("fallback");
    expect(operation).toHaveBeenCalledWith(null, false);
  });

  it("refuses audit-sensitive writes on standalone MongoDB", async () => {
    const session = {
      withTransaction: vi.fn().mockRejectedValue(
        new Error("Transactions are not supported by this deployment")
      ),
      endSession: vi.fn().mockResolvedValue(undefined),
    };
    vi.spyOn(mongoose, "startSession").mockResolvedValue(session as never);
    const operation = vi.fn();

    await expect(
      runInTransaction(operation, { allowStandaloneFallback: false })
    ).rejects.toThrow(/requires MongoDB replica-set transactions/i);
    expect(operation).not.toHaveBeenCalled();
  });
});
