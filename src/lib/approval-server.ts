import type { AuthUser } from "@/lib/auth";
import {
  canReview,
  EDIT_RESUBMIT_NOTE,
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
import Asset from "@/models/Asset";
import Expense from "@/models/Expense";
import "@/models/User";

// Server-side approval writes. Every decision is one conditional
// findOneAndUpdate that matches the expected status AND the edit revision
// (`assetAllocationRevision`) the caller last saw, and increments that
// revision, so two admins (or an admin and the submitter editing it) can't
// both win: the loser gets a 409 with a machine-readable `code`. Admins
// can't decide (or reopen) their own expenses; that rule is in the filter too.

export type ApprovalFailureCode =
  | "not_found"
  | "forbidden"
  | "own_expense"
  | "not_pending"
  | "not_rejected"
  | "not_reviewed"
  | "asset_linked"
  | "stale";

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
  | { action: "resubmit"; revision: number; note: string | null }
  | { action: "reopen"; revision: number; note: string | null };

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

/**
 * The optional `revision` a `PUT /api/expenses/[id]` body carries (what the
 * edit form loaded), or null when it wasn't sent. Throws on a malformed one.
 */
export function parseEditRevision(raw: unknown): number | null {
  if (raw === undefined || raw === null) return null;
  return parseRevision(raw);
}

/** The 409 body for an edit based on an older version of the expense. */
export function staleEditConflict(current: { approvalStatus?: ApprovalStatus | null } | null): {
  error: string;
  code: "stale";
  approvalStatus?: ApprovalStatus;
} {
  return {
    error:
      "This expense changed while you were editing it (for example, an admin reviewed it). Reload to see the latest version.",
    code: "stale",
    ...(current ? { approvalStatus: effectiveApprovalStatus(current) } : {}),
  };
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
    case "reopen":
      return { action: "reopen", revision, note: normalizeApprovalNote(body.note) };
    default:
      throw new Error("Choose approve, reject, resubmit or reopen");
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

/** Populated like the list rows (which include the reviewer), plus who did each history step. */
function populateApprovalRefs(query: LeanDoc): LeanDoc {
  return populateExpenseRefs(query).populate("approvalHistory.by", "name email");
}

async function withAssetCount(expense: LeanDoc): Promise<LeanDoc> {
  const [row] = await withLinkedAssetCounts([expense]);
  return row;
}

const OWN_EXPENSE: ApprovalFailure = {
  ok: false,
  status: 403,
  code: "own_expense",
  error: "You can't review your own expense. Another admin needs to approve or reject it.",
};

const ASSET_LINKED: ApprovalFailure = {
  ok: false,
  status: 409,
  code: "asset_linked",
  error:
    "Assets are registered against this expense, so it can't go back to review. Reverse its assets first.",
};

const STALE_ERROR = {
  review: "This expense changed after you opened it. Review the latest version.",
  resubmit: "This expense changed after you opened it. Check the latest version, then resubmit.",
  reopen: "This expense changed after you opened it. Check the latest version, then try again.",
} as const;

type MissContext =
  | { kind: "review"; actorId: string }
  | { kind: "resubmit"; actorId: string }
  | { kind: "reopen"; actorId: string; assetsLinked: boolean };

/**
 * Explains why a conditional decision matched nothing, checking the same
 * conditions as its filter in a fixed order: gone, who may act, status,
 * linked assets (reopen), and otherwise the revision. Every write increments
 * the revision, so once the rest checks out, the caller's copy is stale.
 */
async function explainMiss(id: string, context: MissContext): Promise<ApprovalFailure> {
  const current = (await Expense.findById(id)
    .select("approvalStatus createdBy assetAllocationRevision assetAllocatedAmount")
    .lean()) as LeanDoc;
  if (!current) return NOT_FOUND;
  const isOwner = String(current.createdBy) === String(context.actorId);
  if (context.kind === "resubmit" && !isOwner) {
    return {
      ok: false,
      status: 403,
      code: "forbidden",
      error: "Only the person who submitted this expense can resubmit it",
    };
  }
  if (context.kind !== "resubmit" && isOwner) return OWN_EXPENSE;

  const approvalStatus = effectiveApprovalStatus(current);
  if (context.kind === "reopen") {
    if (approvalStatus === "pending") {
      return { ok: false, status: 409, code: "not_reviewed", error: ALREADY.pending, approvalStatus };
    }
    if (context.assetsLinked || Number(current.assetAllocatedAmount || 0) > 0) {
      return { ...ASSET_LINKED, approvalStatus };
    }
  } else {
    const expected = context.kind === "review" ? "pending" : "rejected";
    if (approvalStatus !== expected) {
      return {
        ok: false,
        status: 409,
        code: expected === "pending" ? "not_pending" : "not_rejected",
        error: ALREADY[approvalStatus],
        approvalStatus,
      };
    }
  }
  return { ok: false, status: 409, code: "stale", error: STALE_ERROR[context.kind], approvalStatus };
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

/** Pending, not the reviewer's own, and still at the revision they saw. */
function reviewFilter(id: string, revision: number, reviewer: AuthUser) {
  return { _id: id, ...PENDING_MATCH, createdBy: { $ne: reviewer._id }, ...revisionMatch(revision) };
}

function assertReviewer(reviewer: AuthUser): void {
  if (!canReview(reviewer.role)) throw new Error("Only admins can approve or reject expenses");
}

/** Approves or rejects one pending expense the reviewer saw at `revision`. */
export async function reviewExpense(input: ReviewInput): Promise<ApprovalOutcome> {
  assertReviewer(input.reviewer);
  const update = reviewUpdate(input.action, input.reason, input.reviewer, input.now ?? new Date());
  const expense = await populateApprovalRefs(
    Expense.findOneAndUpdate(reviewFilter(input.id, input.revision, input.reviewer), update, {
      new: true,
    })
  ).lean();
  if (!expense) return explainMiss(input.id, { kind: "review", actorId: input.reviewer._id });
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
      const expense = (await Expense.findOneAndUpdate(
        reviewFilter(id, revision, input.reviewer),
        update,
        { new: true }
      ).lean()) as LeanDoc;
      outcomes[index] = expense
        ? { ok: true, expense }
        : await explainMiss(id, { kind: "review", actorId: input.reviewer._id });
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
  if (!expense) return explainMiss(input.id, { kind: "resubmit", actorId: input.user._id });
  return { ok: true, expense: await withAssetCount(expense) };
}

/**
 * An admin moves an approved (or legacy) or rejected expense back to pending,
 * to correct a decision. Not their own expense, and not one with assets
 * registered against it (assets need approved spend). Asset creation reserves
 * its allocation with a revision increment first, so the filter's revision and
 * allocation conditions can't race it; the Asset check covers legacy links
 * recorded without an allocation.
 */
export async function reopenExpense(input: {
  id: string;
  revision: number;
  note: string | null;
  reviewer: AuthUser;
  now?: Date;
}): Promise<ApprovalOutcome> {
  if (!canReview(input.reviewer.role)) throw new Error("Only admins can move an expense back to review");
  const context = { kind: "reopen" as const, actorId: input.reviewer._id };
  if (await Asset.exists({ purchaseExpense: input.id })) {
    return explainMiss(input.id, { ...context, assetsLinked: true });
  }
  const now = input.now ?? new Date();
  const expense = await populateApprovalRefs(
    Expense.findOneAndUpdate(
      {
        _id: input.id,
        approvalStatus: { $in: ["approved", "rejected", null] },
        createdBy: { $ne: input.reviewer._id },
        $and: [
          revisionMatch(input.revision),
          { $or: [{ assetAllocatedAmount: { $exists: false } }, { assetAllocatedAmount: { $lte: 0 } }] },
        ],
      },
      {
        $set: { approvalStatus: "pending", reviewedBy: null, reviewedAt: null, rejectionReason: null },
        $push: {
          approvalHistory: { action: "reopened", by: input.reviewer._id, at: now, note: input.note },
        },
        $inc: { assetAllocationRevision: 1 },
      },
      { new: true }
    )
  ).lean();
  if (!expense) return explainMiss(input.id, { ...context, assetsLinked: false });
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
        note:
          current === "rejected" ? EDIT_RESUBMIT_NOTE.afterRejection : EDIT_RESUBMIT_NOTE.afterApproval,
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
  /**
   * ISO time the longest-waiting expense was (last) sent for review, or null
   * when none wait: its latest submitted / resubmitted / reopened step, or its
   * creation for documents without one.
   */
  oldestPendingAt: string | null;
}

/** History steps that (re)start an expense's wait for an admin. */
const SUBMISSION_ACTIONS: ApprovalHistoryAction[] = ["submitted", "resubmitted", "reopened"];

/** Aggregation expression: when the expense last entered the queue. */
const lastSubmittedAtExpr = {
  $ifNull: [
    {
      $max: {
        $map: {
          input: {
            $filter: {
              input: { $ifNull: ["$approvalHistory", []] },
              as: "step",
              cond: { $in: ["$$step.action", SUBMISSION_ACTIONS] },
            },
          },
          as: "step",
          in: "$$step.at",
        },
      },
    },
    "$createdAt",
  ],
};

export async function countPendingApprovals(): Promise<PendingApprovalCount> {
  const [row] = (await Expense.aggregate([
    { $match: PENDING_MATCH },
    {
      $group: {
        _id: null,
        pendingCount: { $sum: 1 },
        pendingAmount: { $sum: baseTotalExpr },
        oldestPendingAt: { $min: lastSubmittedAtExpr },
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
