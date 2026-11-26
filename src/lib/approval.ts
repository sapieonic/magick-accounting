import type { AuthUser } from "@/lib/auth";

// Client-safe approval rules shared by the routes, the aggregations and the UI.
// Expenses created by role `user` wait for an admin; admins' own entries are
// approved on creation. Documents written before approvals existed have no
// `approvalStatus` and count as approved, so nothing needs backfilling.

export type Role = AuthUser["role"];

export type ApprovalStatus = "pending" | "approved" | "rejected";

export const APPROVAL_STATUSES: ApprovalStatus[] = ["pending", "approved", "rejected"];

/** One entry in an expense's append-only approval audit trail. */
export type ApprovalHistoryAction =
  | "submitted"
  | "auto_approved"
  | "approved"
  | "rejected"
  | "resubmitted"
  | "reopened";

export const APPROVAL_HISTORY_ACTIONS: ApprovalHistoryAction[] = [
  "submitted",
  "auto_approved",
  "approved",
  "rejected",
  "resubmitted",
  "reopened",
];

export type ReviewAction = "approve" | "reject";

/**
 * Every action `POST /api/expenses/[id]/approval` takes: an admin's decision,
 * the submitter resubmitting a rejection, or an admin moving an approved or
 * rejected expense back to pending (to correct a decision).
 */
export type ApprovalAction = ReviewAction | "resubmit" | "reopen";

export const REJECTION_REASON_MIN = 3;
export const REJECTION_REASON_MAX = 500;
export const APPROVAL_NOTE_MAX = 500;
/** Most expenses one bulk approve/reject request may carry. */
export const MAX_BULK_REVIEW = 100;

/** Query: expenses that count as real spend (a missing status is legacy, so approved). */
export const APPROVED_MATCH = { approvalStatus: { $nin: ["pending", "rejected"] } };

/** Query: expenses waiting for an admin. */
export const PENDING_MATCH = { approvalStatus: "pending" };

/** Aggregation expression mirroring `APPROVED_MATCH`. */
export const isApprovedExpr = {
  $not: [{ $in: [{ $ifNull: ["$approvalStatus", "approved"] }, ["pending", "rejected"]] }],
};

/** Aggregation expression mirroring `PENDING_MATCH`. */
export const isPendingExpr = { $eq: ["$approvalStatus", "pending"] };

/** Aggregation expression: the expense was rejected. */
export const isRejectedExpr = { $eq: ["$approvalStatus", "rejected"] };

/** Narrows a filter to approved (real) spend without clobbering its own keys. */
export function withApproved(filter: Record<string, unknown>): Record<string, unknown> {
  if (Object.keys(filter).length === 0) return { ...APPROVED_MATCH };
  return { $and: [filter, APPROVED_MATCH] };
}

interface HasApprovalStatus {
  approvalStatus?: ApprovalStatus | null;
}

function isApprovalStatus(value: unknown): value is ApprovalStatus {
  return typeof value === "string" && (APPROVAL_STATUSES as string[]).includes(value);
}

/** The status to show and act on; legacy documents without one are approved. */
export function effectiveApprovalStatus(expense: HasApprovalStatus): ApprovalStatus {
  return isApprovalStatus(expense.approvalStatus) ? expense.approvalStatus : "approved";
}

/** Whether the expense counts toward totals (client mirror of `APPROVED_MATCH`). */
export function countsAsSpend(expense: HasApprovalStatus): boolean {
  return effectiveApprovalStatus(expense) === "approved";
}

/**
 * Who may delete an expense. Approved spend (legacy included) is in the books,
 * so only the master admin can remove it; while an expense is pending or
 * rejected its submitter can delete it, and so can any admin.
 */
export function canDeleteExpense(
  viewer: { _id: string; role: Role },
  expense: { createdBy?: unknown; approvalStatus?: ApprovalStatus | null }
): boolean {
  if (countsAsSpend(expense)) return viewer.role === "master_admin";
  if (canReview(viewer.role)) return true;
  return idOf(expense.createdBy) === String(viewer._id);
}

/** Why `canDeleteExpense` refused an approved expense, for the API and the UI. */
export const APPROVED_DELETE_MESSAGE =
  "Approved expenses are part of the books, so only the master admin can delete them.";

/** Only admins approve or reject. */
export function canReview(role: Role): boolean {
  return role === "admin" || role === "master_admin";
}

function idOf(ref: unknown): string | null {
  if (ref === null || ref === undefined) return null;
  if (typeof ref === "object" && "_id" in (ref as object)) return String((ref as { _id: unknown })._id);
  return String(ref);
}

/**
 * Whether `viewer` may approve or reject this expense: an admin, and not its
 * submitter (an admin promoted from `user` can't sign off their own
 * submissions; another admin has to).
 */
export function canReviewExpense(
  viewer: { _id: string; role: Role },
  expense: { createdBy?: unknown }
): boolean {
  return canReview(viewer.role) && idOf(expense.createdBy) !== String(viewer._id);
}

export function initialApprovalStatus(role: Role): "pending" | "approved" {
  return canReview(role) ? "approved" : "pending";
}

export interface ApprovalHistoryEntry<Id = string> {
  action: ApprovalHistoryAction;
  by: Id;
  at: Date;
  note: string | null;
}

export interface CreationApprovalFields {
  approvalStatus: "pending" | "approved";
  reviewedBy: string | null;
  reviewedAt: Date | null;
  rejectionReason: null;
  approvalHistory: ApprovalHistoryEntry[];
}

/** The approval fields every new expense is created with, decided by the creator's role. */
export function creationApprovalFields(
  actor: { _id: string | { toString(): string }; role: Role },
  now: Date = new Date()
): CreationApprovalFields {
  const by = String(actor._id);
  const status = initialApprovalStatus(actor.role);
  if (status === "approved") {
    return {
      approvalStatus: "approved",
      reviewedBy: by,
      reviewedAt: now,
      rejectionReason: null,
      approvalHistory: [{ action: "auto_approved", by, at: now, note: null }],
    };
  }
  return {
    approvalStatus: "pending",
    reviewedBy: null,
    reviewedAt: null,
    rejectionReason: null,
    approvalHistory: [{ action: "submitted", by, at: now, note: null }],
  };
}

/**
 * The status an expense moves to after an edit, or `null` to leave it as is.
 *
 * Admin edits never change it. When its submitter (role `user`) saves it:
 * - rejected → pending on any save (editing is how a rejection is fixed);
 * - approved (or legacy) → pending when a reviewed field changed: the
 *   accounting fields plus title and description (the set the linked-asset
 *   guard protects; moving it to a trip isn't one);
 * - pending stays pending.
 */
export function statusAfterEdit(args: {
  role: Role;
  isOwner: boolean;
  current: ApprovalStatus;
  accountingChanged: boolean;
}): ApprovalStatus | null {
  if (canReview(args.role) || !args.isOwner) return null;
  if (args.current === "rejected") return "pending";
  if (args.current === "approved" && args.accountingChanged) return "pending";
  return null;
}

/** Validates an admin's rejection reason. Throws a user-facing Error. */
export function normalizeRejectionReason(raw: unknown): string {
  const reason = typeof raw === "string" ? raw.trim() : "";
  if (reason.length < REJECTION_REASON_MIN) {
    throw new Error("Add a reason so the submitter knows what to fix");
  }
  if (reason.length > REJECTION_REASON_MAX) {
    throw new Error(`Keep the reason under ${REJECTION_REASON_MAX} characters`);
  }
  return reason;
}

/** Validates an optional note (e.g. on resubmission). Throws a user-facing Error. */
export function normalizeApprovalNote(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") throw new Error("Note must be text");
  const note = raw.trim();
  if (!note) return null;
  if (note.length > APPROVAL_NOTE_MAX) {
    throw new Error(`Keep the note under ${APPROVAL_NOTE_MAX} characters`);
  }
  return note;
}

/** The list's `approval` param; "all", absent or unknown values mean no filter. */
export function parseApprovalFilter(value: string | null | undefined): ApprovalStatus | null {
  return isApprovalStatus(value) ? value : null;
}

/** Plain-language labels used everywhere in the UI. */
export const APPROVAL_LABEL: Record<ApprovalStatus, string> = {
  pending: "Awaiting approval",
  approved: "Approved",
  rejected: "Rejected",
};

export const APPROVAL_HISTORY_LABEL: Record<ApprovalHistoryAction, string> = {
  submitted: "Submitted",
  auto_approved: "Added by an admin, approved automatically",
  approved: "Approved",
  rejected: "Rejected",
  resubmitted: "Resubmitted",
  reopened: "Moved back to review",
};

/**
 * The notes the server writes itself when a submitter's edit sends an
 * expense back for approval. The UI shows them as plain events, not as a
 * quote from the person, so both sides must use these constants.
 */
export const EDIT_RESUBMIT_NOTE = {
  afterApproval: "Edited after approval",
  afterRejection: "Edited after rejection",
} as const;

export function isSystemNote(note: string | null | undefined): boolean {
  return note === EDIT_RESUBMIT_NOTE.afterApproval || note === EDIT_RESUBMIT_NOTE.afterRejection;
}

/** Screen-reader context for an amount that isn't in totals (rows, latest entries). */
export const NOT_IN_TOTALS_SR: Record<Exclude<ApprovalStatus, "approved">, string> = {
  pending: " (awaiting approval, not in totals)",
  rejected: " (rejected, not in totals)",
};

export function approvalStatusCsvLabel(expense: HasApprovalStatus): string {
  return APPROVAL_LABEL[effectiveApprovalStatus(expense)];
}
