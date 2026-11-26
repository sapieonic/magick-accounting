import { describe, it, expect } from "vitest";
import {
  approvalDate,
  expensePersonName,
  historyLine,
  latestResubmission,
  personName,
  relativeTime,
  submittedAt,
} from "./approval-format";
import type { ExpenseListItem } from "@/types/expense";

const base: ExpenseListItem = {
  _id: "e1",
  title: "Taxi",
  amount: 450,
  date: "2026-11-20T00:00:00.000Z",
  description: "",
  category: { _id: "c", name: "Travel" },
  department: { _id: "d", name: "Sales" },
  createdBy: { _id: "u1", name: "Asha Rao", email: "asha@example.com" },
  approvalStatus: "pending",
  createdAt: "2026-11-10T00:00:00.000Z",
};

describe("approval-format", () => {
  it("says how long ago, with 'just now' for the last minute", () => {
    const now = new Date("2026-11-25T12:00:00.000Z");
    expect(relativeTime("2026-11-19T12:00:00.000Z", now)).toBe("6 days ago");
    expect(relativeTime("2026-11-25T11:59:30.000Z", now)).toBe("just now");
    expect(relativeTime(null, now)).toBeNull();
    expect(relativeTime("not a date", now)).toBeNull();
  });

  it("dates a submission from its latest (re)submission, else its creation", () => {
    expect(submittedAt(base)).toBe("2026-11-10T00:00:00.000Z");
    expect(
      submittedAt({
        ...base,
        approvalHistory: [
          { action: "submitted", by: "u1", at: "2026-11-10T00:00:00.000Z", note: null },
          { action: "rejected", by: "p", at: "2026-11-11T00:00:00.000Z", note: "Duplicate" },
          { action: "resubmitted", by: "u1", at: "2026-11-12T00:00:00.000Z", note: null },
        ],
      })
    ).toBe("2026-11-12T00:00:00.000Z");
  });

  it("names people from populated refs, with a fallback for bare ids", () => {
    expect(personName({ _id: "p", name: "Priya" })).toBe("Priya");
    expect(personName({ _id: "p", email: "priya@example.com" })).toBe("priya@example.com");
    expect(personName("p")).toBeNull();
    expect(personName("p", "an admin")).toBe("an admin");
    expect(personName(null, "Someone")).toBe("Someone");
  });

  it("names bare ids from the expense's own submitter or reviewer", () => {
    expect(expensePersonName({ _id: "p", name: "Priya" }, base)).toBe("Priya");
    expect(expensePersonName("u1", base)).toBe("Asha Rao");
    expect(expensePersonName("p", { ...base, reviewedBy: { _id: "p", name: "Priya" } })).toBe("Priya");
    expect(expensePersonName("someone-else", base)).toBeNull();
  });

  it("dates approval events one way, with the year", () => {
    expect(approvalDate("2026-11-12T09:00:00.000Z")).toBe("12 Nov 2026");
    expect(approvalDate(new Date("2025-01-03T09:00:00.000Z"))).toBe("3 Jan 2025");
    expect(approvalDate(null)).toBeNull();
    expect(approvalDate("nope")).toBeNull();
  });

  it("counts a move back to review as the latest submission", () => {
    expect(
      submittedAt({
        ...base,
        approvalHistory: [
          { action: "submitted", by: "u1", at: "2026-11-10T00:00:00.000Z", note: null },
          { action: "approved", by: "p", at: "2026-11-11T00:00:00.000Z", note: null },
          { action: "reopened", by: "p", at: "2026-11-13T00:00:00.000Z", note: null },
        ],
      })
    ).toBe("2026-11-13T00:00:00.000Z");
  });

  it("writes a history entry's note as a quote, or the server's edit marker as an event", () => {
    const at = "2026-11-12T00:00:00.000Z";
    expect(historyLine({ action: "rejected", by: { _id: "p", name: "Priya" }, at, note: "Duplicate" }, base)).toEqual({
      summary: "Rejected · Priya · 12 Nov 2026",
      quote: "Duplicate",
      event: null,
    });
    expect(historyLine({ action: "resubmitted", by: "u1", at, note: "Edited after approval" }, base)).toEqual({
      summary: "Resubmitted · Asha Rao · 12 Nov 2026",
      quote: null,
      event: "Asha Rao edited it after it was approved.",
    });
    expect(historyLine({ action: "reopened", by: { _id: "p", name: "Priya" }, at, note: null }, base).summary).toBe(
      "Moved back to review · Priya · 12 Nov 2026"
    );
  });

  it("tells a submitter's own note from the server's edit marker", () => {
    const resubmitted = (note: string | null) =>
      latestResubmission({ ...base, approvalHistory: [{ action: "resubmitted", by: "u1", at: "2026-11-12T00:00:00.000Z", note }] });
    expect(resubmitted("Client was there")).toEqual({ name: "Asha Rao", note: "Client was there", edited: null });
    expect(resubmitted("Edited after rejection")).toEqual({ name: "Asha Rao", note: null, edited: "edited it after it was rejected" });
    expect(resubmitted(null)).toBeNull();
  });
});
