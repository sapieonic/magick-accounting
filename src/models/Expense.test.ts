import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import Expense from "@/models/Expense";
import { EXPENSE_LIST_SORT } from "@/lib/expense-query";

describe("Expense indexes", () => {
  // As JSON, so field order (which an index's usefulness depends on) is compared too.
  const keys = (Expense.schema.indexes() as [Record<string, number>, unknown][]).map(([key]) =>
    JSON.stringify(key)
  );

  it("cover the expense list's sort, for everyone and for one submitter", () => {
    // Same fields, order and direction, so the list never sorts in memory.
    expect(keys).toContain(JSON.stringify(EXPENSE_LIST_SORT));
    expect(keys).toContain(JSON.stringify({ createdBy: 1, ...EXPENSE_LIST_SORT }));
  });

  it("has no index that is only a prefix of those", () => {
    expect(keys).not.toContain(JSON.stringify({ date: -1 }));
    expect(keys).not.toContain(JSON.stringify({ createdBy: 1, date: -1 }));
  });
});

describe("Expense approval fields", () => {
  const valid = () => ({
    title: "Taxi",
    amount: 100,
    category: new mongoose.Types.ObjectId(),
    department: new mongoose.Types.ObjectId(),
    date: new Date("2026-11-01"),
    createdBy: new mongoose.Types.ObjectId(),
  });

  it("has an index for the list narrowed by approval status, in list order", () => {
    const keys = (Expense.schema.indexes() as [Record<string, number>, unknown][]).map(([key]) =>
      JSON.stringify(key)
    );
    expect(keys).toContain(JSON.stringify({ approvalStatus: 1, ...EXPENSE_LIST_SORT }));
  });

  it("requires a status on every new expense instead of defaulting one", () => {
    const expense = new Expense(valid());

    expect(expense.approvalStatus).toBeUndefined();
    expect(expense.validateSync()?.errors.approvalStatus?.kind).toBe("required");
  });

  it("accepts a new expense created with a status and its history", () => {
    const by = new mongoose.Types.ObjectId();
    const expense = new Expense({
      ...valid(),
      approvalStatus: "pending",
      approvalHistory: [{ action: "submitted", by, at: new Date(), note: null }],
    });

    expect(expense.validateSync()).toBeUndefined();
    expect(expense.reviewedBy).toBeNull();
    expect(expense.rejectionReason).toBeNull();
  });

  it("doesn't require a status on documents written before approvals existed", () => {
    const legacy = Expense.hydrate({ _id: new mongoose.Types.ObjectId(), ...valid() });

    expect(legacy.validateSync()?.errors.approvalStatus).toBeUndefined();
  });

  it("rejects unknown statuses, history actions and over-long reasons", () => {
    const expense = new Expense({
      ...valid(),
      approvalStatus: "maybe",
      rejectionReason: "x".repeat(501),
      approvalHistory: [{ action: "shrugged", by: new mongoose.Types.ObjectId(), at: new Date() }],
    });
    const errors = expense.validateSync()?.errors ?? {};

    expect(errors.approvalStatus?.kind).toBe("enum");
    expect(errors.rejectionReason?.kind).toBe("maxlength");
    expect(errors["approvalHistory.0.action"]?.kind).toBe("enum");
  });
});
