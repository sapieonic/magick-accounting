import { describe, it, expect } from "vitest";
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
