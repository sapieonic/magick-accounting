import { describe, it, expect } from "vitest";
import { Aggregator, Query } from "mingo";
import "mingo/init/system";
import {
  APPROVED_MATCH,
  PENDING_MATCH,
  approvalStatusCsvLabel,
  canReview,
  countsAsSpend,
  creationApprovalFields,
  effectiveApprovalStatus,
  isApprovedExpr,
  isPendingExpr,
  normalizeApprovalNote,
  normalizeRejectionReason,
  parseApprovalFilter,
  statusAfterEdit,
  withApproved,
} from "@/lib/approval";

const DOCS = [
  { _id: "legacy" },
  { _id: "null", approvalStatus: null },
  { _id: "approved", approvalStatus: "approved" },
  { _id: "pending", approvalStatus: "pending" },
  { _id: "rejected", approvalStatus: "rejected" },
];

describe("approved/pending matchers", () => {
  it("APPROVED_MATCH counts legacy, null and approved, not pending or rejected", () => {
    const ids = new Query(APPROVED_MATCH).find(DOCS).all().map((d) => d._id);
    expect(ids).toEqual(["legacy", "null", "approved"]);
  });

  it("isApprovedExpr agrees with APPROVED_MATCH and countsAsSpend", () => {
    const rows = new Aggregator([
      { $project: { _id: 1, counted: isApprovedExpr, pending: isPendingExpr } },
    ]).run(DOCS) as { _id: string; counted: boolean; pending: boolean }[];
    expect(rows.filter((r) => r.counted).map((r) => r._id)).toEqual(["legacy", "null", "approved"]);
    expect(rows.filter((r) => r.pending).map((r) => r._id)).toEqual(["pending"]);
    for (const doc of DOCS) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(countsAsSpend(doc as any)).toBe(rows.find((r) => r._id === doc._id)!.counted);
    }
  });

  it("PENDING_MATCH only matches pending", () => {
    expect(new Query(PENDING_MATCH).find(DOCS).all().map((d) => d._id)).toEqual(["pending"]);
  });

  it("withApproved keeps the original filter's keys", () => {
    const filter = { createdBy: "u1", $or: [{ title: "x" }] };
    expect(withApproved(filter)).toEqual({ $and: [filter, APPROVED_MATCH] });
    expect(withApproved({})).toEqual(APPROVED_MATCH);
  });

  it("effectiveApprovalStatus defaults to approved", () => {
    expect(effectiveApprovalStatus({})).toBe("approved");
    expect(effectiveApprovalStatus({ approvalStatus: null })).toBe("approved");
    expect(effectiveApprovalStatus({ approvalStatus: "rejected" })).toBe("rejected");
    expect(approvalStatusCsvLabel({ approvalStatus: "pending" })).toBe("Awaiting approval");
  });
});

describe("creationApprovalFields", () => {
  const now = new Date("2026-11-25T10:00:00Z");

  it("role user submits for approval", () => {
    expect(creationApprovalFields({ _id: "u1", role: "user" }, now)).toEqual({
      approvalStatus: "pending",
      reviewedBy: null,
      reviewedAt: null,
      rejectionReason: null,
      approvalHistory: [{ action: "submitted", by: "u1", at: now, note: null }],
    });
  });

  it.each(["admin", "master_admin"] as const)("%s is approved automatically", (role) => {
    expect(creationApprovalFields({ _id: "a1", role }, now)).toEqual({
      approvalStatus: "approved",
      reviewedBy: "a1",
      reviewedAt: now,
      rejectionReason: null,
      approvalHistory: [{ action: "auto_approved", by: "a1", at: now, note: null }],
    });
  });

  it("canReview is admin-only", () => {
    expect(canReview("user")).toBe(false);
    expect(canReview("admin")).toBe(true);
    expect(canReview("master_admin")).toBe(true);
  });
});

describe("statusAfterEdit", () => {
  const base = { role: "user" as const, isOwner: true };

  it("never changes status for admin edits", () => {
    for (const current of ["pending", "approved", "rejected"] as const) {
      expect(statusAfterEdit({ ...base, role: "admin", current, accountingChanged: true })).toBeNull();
    }
  });

  it("sends an approved expense back when the owner changes an accounting field", () => {
    expect(statusAfterEdit({ ...base, current: "approved", accountingChanged: true })).toBe("pending");
  });

  it("keeps an approved expense approved for non-accounting edits", () => {
    expect(statusAfterEdit({ ...base, current: "approved", accountingChanged: false })).toBeNull();
  });

  it("resubmits a rejected expense on any owner save", () => {
    expect(statusAfterEdit({ ...base, current: "rejected", accountingChanged: false })).toBe("pending");
  });

  it("leaves a pending expense pending", () => {
    expect(statusAfterEdit({ ...base, current: "pending", accountingChanged: true })).toBeNull();
  });
});

describe("validation", () => {
  it("requires a meaningful rejection reason", () => {
    expect(() => normalizeRejectionReason("")).toThrow(/reason/);
    expect(() => normalizeRejectionReason("  ok ")).toThrow(/reason/);
    expect(() => normalizeRejectionReason(undefined)).toThrow(/reason/);
    expect(() => normalizeRejectionReason("x".repeat(501))).toThrow(/500/);
    expect(normalizeRejectionReason("  Receipt missing  ")).toBe("Receipt missing");
  });

  it("normalizes optional notes", () => {
    expect(normalizeApprovalNote(undefined)).toBeNull();
    expect(normalizeApprovalNote("   ")).toBeNull();
    expect(normalizeApprovalNote(" client visit ")).toBe("client visit");
    expect(() => normalizeApprovalNote(5)).toThrow();
    expect(() => normalizeApprovalNote("x".repeat(501))).toThrow(/500/);
  });

  it("parses the approval list filter", () => {
    expect(parseApprovalFilter("pending")).toBe("pending");
    expect(parseApprovalFilter("approved")).toBe("approved");
    expect(parseApprovalFilter("rejected")).toBe("rejected");
    expect(parseApprovalFilter("all")).toBeNull();
    expect(parseApprovalFilter(null)).toBeNull();
    expect(parseApprovalFilter("bogus")).toBeNull();
  });
});
