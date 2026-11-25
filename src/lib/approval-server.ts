import type { AuthUser } from "@/lib/auth";
import {
  canReview,
  effectiveApprovalStatus,
  MAX_BULK_REVIEW,
  normalizeApprovalNote,
  normalizeRejectionReason,
  PENDING_MATCH,
  statusAfterEdit,
  type ApprovalHistoryAction,
  type ApprovalStatus,
  type ReviewAction,
} from "@/lib/approval";
import { roundMoney } from "@/lib/asset";
import { baseTotalExpr } from "@/lib/expense";
import { revisionMatch } from "@/lib/expense-server";
import { OBJECT_ID_PATTERN } from "@/lib/trip";
import { populateExpenseRefs, withLinkedAssetCounts, type LeanDoc } from "@/lib/trip-query";
import Expense from "@/models/Expense";
import "@/models/User";

// Server-side approval writes. Every decision is one conditional
// findOneAndUpdate that matches the expected status AND the edit revision
// (`assetAllocationRevision`) the caller last saw, and increments that
// revision, so two admins (or an admin and the submitter editing it) can't
// both win: the loser gets a 409 with a machine-readable `code`.

export type ApprovalFailureCode = "not_found" | "forbidden" | "not_pending" | "not_rejected" | "stale";

export type ApprovalOutcome =
  | { ok: true; expense: LeanDoc }
  | {
      ok: false;
      status: 403 | 404 | 409;
      code: ApprovalFailureCode;
      error: string;
      approvalStatus?: ApprovalStatus;
    };

type ApprovalFailure = Extract<ApprovalOutcome, { ok: false }>;

// ---------------------------------------------------------------------------
// Request parsing (throws Errors whose message is shown to the person)

export type ApprovalRequest =
  | { action: "approve"; revision: number }
  | { action: "reject"; revision: number; reason: string }
  | { action: "resubmit"; revision: number; note: string | null };

export interface BulkReviewRequest {
  action: ReviewAction;
  items: { id: string; revision: number }[];
  reason: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The revision the client last saw (`expense.assetAllocationRevision ?? 0`). */
export function parseRevision(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw < 0) {
    throw new Error("Expense version is missing or invalid. Reload and try again.");
  }
  return raw;
}

/** Body of `POST /api/expenses/[id]/approval`. */
export function parseApprovalRequest(body: unknown): ApprovalRequest {
  if (!isRecord(body)) throw new Error("Request body is invalid");
  const revision = parseRevision(body.revision);
  switch (body.action) {
    case "approve":
      return { action: "approve", revision };
    case "reject":
      return { action: "reject", revision, reason: normalizeRejectionReason(body.reason) };
    case "resubmit":
      return { action: "resubmit", revision, note: normalizeApprovalNote(body.note) };
    default:
      throw new Error("Choose approve, reject or resubmit");
  }
}

/** Body of `POST /api/expenses/approvals`. Ids come back lowercased and unique. */
export function parseBulkReviewRequest(body: unknown): BulkReviewRequest {
  if (!isRecord(body)) throw new Error("Request body is invalid");
  const action = body.action;
  if (action !== "approve" && action !== "reject") throw new Error("Choose approve or reject");
  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw new Error("Select at least one expense");
  }
  if (body.items.length > MAX_BULK_REVIEW) {
    throw new Error(`You can review at most ${MAX_BULK_REVIEW} expenses at a time`);
  }
  const seen = new Set<string>();
  const items = body.items.map((item: unknown) => {
    if (!isRecord(item)) throw new Error("Expense id is invalid");
    const id = typeof item.id === "string" ? item.id.trim().toLowerCase() : "";
    if (!OBJECT_ID_PATTERN.test(id)) throw new Error("Expense id is invalid");
    if (seen.has(id)) throw new Error("Each expense can only be included once");
    seen.add(id);
    return { id, revision: parseRevision(item.revision) };
  });
  const reason = action === "reject" ? normalizeRejectionReason(body.reason) : null;
  return { action, items, reason };
}

// ---------------------------------------------------------------------------
// Decisions

const HISTORY_ACTION: Record<ReviewAction, ApprovalHistoryAction> = {
  approve: "approved",
  reject: "rejected",
};

const NOT_FOUND: ApprovalFailure = {
  ok: false,
  status: 404,
  code: "not_found",
  error: "This expense no longer exists. It may have been deleted.",
};

const ALREADY: Record<ApprovalStatus, string> = {
  pending: "This expense is already awaiting approval.",
  approved: "This expense was already approved.",
  rejected: "This expense was already rejected.",
};

/** Populated like the list rows, plus the reviewer and who did each history step. */
function populateApprovalRefs(query: LeanDoc): LeanDoc {
  return populateExpenseRefs(query)
    .populate("reviewedBy", "name email")
    .populate("approvalHistory.by", "name email");
}

async function withAssetCount(expense: LeanDoc): Promise<LeanDoc> {
  const [row] = await withLinkedAssetCounts([expense]);
  return row;
}

/**
 * Explains why a conditional decision matched nothing. Every status change
 * increments the revision, so once status (and owner) check out, the caller's
 * revision must be stale.
 */
async function explainMiss(
  id: string,
  expected: "pending" | "rejected",
  ownerId?: string
): Promise<ApprovalFailure> {
  const current = (await Expense.findById(id)
    .select("approvalStatus createdBy assetAllocationRevision")
    .lean()) as LeanDoc;
  if (!current) return NOT_FOUND;
  if (ownerId !== undefined && String(current.createdBy) !== ownerId) {
    return {
      ok: false,
      status: 403,
      code: "forbidden",
      error: "Only the person who submitted this expense can resubmit it",
    };
  }
  const approvalStatus = effectiveApprovalStatus(current);
  if (approvalStatus !== expected) {
    return {
      ok: false,
      status: 409,
      code: expected === "pending" ? "not_pending" : "not_rejected",
      error: ALREADY[approvalStatus],
      approvalStatus,
    };
  }
  return {
    ok: false,
    status: 409,
    code: "stale",
    error:
      expected === "pending"
        ? "This expense changed after you opened it. Review the latest version."
        : "This expense changed after you opened it. Check the latest version, then resubmit.",
    approvalStatus,
  };
}

interface ReviewInput {
  id: string;
  action: ReviewAction;
  revision: number;
  /** Required to reject; ignored on approve. */
  reason?: string | null;
  reviewer: AuthUser;
  now?: Date;
}

function reviewUpdate(
  action: ReviewAction,
  reason: string | null | undefined,
  reviewer: AuthUser,
  now: Date
) {
  const rejecting = action === "reject";
  const note = rejecting ? normalizeRejectionReason(reason) : null;
  return {
    $set: {
      approvalStatus: rejecting ? "rejected" : "approved",
      reviewedBy: reviewer._id,
      reviewedAt: now,
      rejectionReason: note,
    },
    $push: { approvalHistory: { action: HISTORY_ACTION[action], by: reviewer._id, at: now, note } },
    $inc: { assetAllocationRevision: 1 },
  };
}

function reviewFilter(id: string, revision: number) {
  return { _id: id, ...PENDING_MATCH, ...revisionMatch(revision) };
}

function assertReviewer(reviewer: AuthUser): void {
  if (!canReview(reviewer.role)) throw new Error("Only admins can approve or reject expenses");
}

/** Approves or rejects one pending expense the reviewer saw at `revision`. */
export async function reviewExpense(input: ReviewInput): Promise<ApprovalOutcome> {
  assertReviewer(input.reviewer);
  const update = reviewUpdate(input.action, input.reason, input.reviewer, input.now ?? new Date());
  const expense = await populateApprovalRefs(
    Expense.findOneAndUpdate(reviewFilter(input.id, input.revision), update, { new: true })
  ).lean();
  if (!expense) return explainMiss(input.id, "pending");
  return { ok: true, expense: await withAssetCount(expense) };
}

export interface BulkReviewResult {
  done: string[];
  failed: { id: string; code: ApprovalFailureCode; error: string }[];
  /** The updated (unpopulated) documents, for notifications. */
  reviewed: LeanDoc[];
}

/** How many decisions of one bulk request run at once. */
const BULK_CONCURRENCY = 10;

/**
 * Applies one decision to many expenses. Each is its own conditional update,
 * so some may fail (already reviewed, changed) while the rest go through.
 */
export async function reviewExpenses(input: {
  action: ReviewAction;
  items: { id: string; revision: number }[];
  reason?: string | null;
  reviewer: AuthUser;
  now?: Date;
}): Promise<BulkReviewResult> {
  assertReviewer(input.reviewer);
  const update = reviewUpdate(input.action, input.reason, input.reviewer, input.now ?? new Date());
  const outcomes: ({ ok: true; expense: LeanDoc } | ApprovalFailure)[] = new Array(input.items.length);

  let next = 0;
  async function worker() {
    while (next < input.items.length) {
      const index = next++;
      const { id, revision } = input.items[index];
      const expense = (await Expense.findOneAndUpdate(reviewFilter(id, revision), update, {
        new: true,
      }).lean()) as LeanDoc;
      outcomes[index] = expense ? { ok: true, expense } : await explainMiss(id, "pending");
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(BULK_CONCURRENCY, input.items.length) }, () => worker())
  );

  const result: BulkReviewResult = { done: [], failed: [], reviewed: [] };
  outcomes.forEach((outcome, index) => {
    const { id } = input.items[index];
    if (outcome.ok) {
      result.done.push(id);
      result.reviewed.push(outcome.expense);
    } else {
      result.failed.push({ id, code: outcome.code, error: outcome.error });
    }
  });
  return result;
}

/** The submitter sends a rejected expense back for review, unchanged, with an optional note. */
export async function resubmitExpense(input: {
  id: string;
  revision: number;
  note: string | null;
  user: AuthUser;
  now?: Date;
}): Promise<ApprovalOutcome> {
  const now = input.now ?? new Date();
  const expense = await populateApprovalRefs(
    Expense.findOneAndUpdate(
      {
        _id: input.id,
        createdBy: input.user._id,
        approvalStatus: "rejected",
        ...revisionMatch(input.revision),
      },
      {
        $set: { approvalStatus: "pending", reviewedBy: null, reviewedAt: null, rejectionReason: null },
        $push: {
          approvalHistory: { action: "resubmitted", by: input.user._id, at: now, note: input.note },
        },
        $inc: { assetAllocationRevision: 1 },
      },
      { new: true }
    )
  ).lean();
  if (!expense) return explainMiss(input.id, "rejected", input.user._id);
  return { ok: true, expense: await withAssetCount(expense) };
}

/**
 * The approval part of a `PUT /api/expenses/[id]` update, or `null` when the
 * edit leaves the status alone (see `statusAfterEdit`). Merged into the
 * route's revision-checked update, so it can't race a review.
 */
export function approvalChangeAfterEdit(args: {
  expense: { approvalStatus?: ApprovalStatus | null; createdBy: { toString(): string } };
  editor: AuthUser;
  accountingChanged: boolean;
  now?: Date;
}): {
  $set: { approvalStatus: "pending"; reviewedBy: null; reviewedAt: null; rejectionReason: null };
  $push: { approvalHistory: { action: "resubmitted"; by: string; at: Date; note: string } };
} | null {
  const current = effectiveApprovalStatus(args.expense);
  const next = statusAfterEdit({
    role: args.editor.role,
    isOwner: args.expense.createdBy.toString() === args.editor._id,
    current,
    accountingChanged: args.accountingChanged,
  });
  if (next !== "pending") return null;
  return {
    $set: { approvalStatus: "pending", reviewedBy: null, reviewedAt: null, rejectionReason: null },
    $push: {
      approvalHistory: {
        action: "resubmitted",
        by: args.editor._id,
        at: args.now ?? new Date(),
        note: current === "rejected" ? "Edited after rejection" : "Edited after approval",
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Queue size

export interface PendingApprovalCount {
  pendingCount: number;
  /** In base currency. */
  pendingAmount: number;
  /** ISO time the oldest waiting expense was created, or null when none wait. */
  oldestPendingAt: string | null;
}

export async function countPendingApprovals(): Promise<PendingApprovalCount> {
  const [row] = (await Expense.aggregate([
    { $match: PENDING_MATCH },
    {
      $group: {
        _id: null,
        pendingCount: { $sum: 1 },
        pendingAmount: { $sum: baseTotalExpr },
        oldestPendingAt: { $min: "$createdAt" },
      },
    },
  ])) as { pendingCount: number; pendingAmount: number; oldestPendingAt: Date | null }[];
  if (!row) return { pendingCount: 0, pendingAmount: 0, oldestPendingAt: null };
  return {
    pendingCount: row.pendingCount,
    pendingAmount: roundMoney(row.pendingAmount || 0),
    oldestPendingAt: row.oldestPendingAt ? new Date(row.oldestPendingAt).toISOString() : null,
  };
}
