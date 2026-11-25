import { describe, it, expect } from "vitest";
import { latestResubmission, personName, relativeTime, submittedAt } from "./approval-format";
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

  it("names people from populated refs or the expense's own submitter", () => {
    expect(personName({ _id: "p", name: "Priya" }, base)).toBe("Priya");
    expect(personName("u1", base)).toBe("Asha Rao");
    expect(personName("someone-else", base)).toBeNull();
  });

  it("tells a submitter's own note from the server's edit marker", () => {
    const resubmitted = (note: string | null) =>
      latestResubmission({ ...base, approvalHistory: [{ action: "resubmitted", by: "u1", at: "2026-11-12T00:00:00.000Z", note }] });
    expect(resubmitted("Client was there")).toEqual({ name: "Asha Rao", note: "Client was there", edited: null });
    expect(resubmitted("Edited after rejection")).toEqual({ name: "Asha Rao", note: null, edited: "edited it after it was rejected" });
    expect(resubmitted(null)).toBeNull();
  });
});
