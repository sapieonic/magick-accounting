"use client";

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiError, api } from "@/lib/api";
import {
  MAX_BULK_REVIEW,
  canReview,
  effectiveApprovalStatus,
  type ApprovalStatus,
  type ReviewAction,
} from "@/lib/approval";
import { useAuth } from "@/contexts/AuthContext";
import { useApprovalCount } from "@/contexts/ApprovalCountContext";
import { useToast } from "@/components/ui/Toast";
import { UNDO_WINDOW_MS, usePendingCommits } from "@/hooks/usePendingCommits";
import RejectDialog from "@/components/approvals/RejectDialog";
import ResubmitDialog from "@/components/approvals/ResubmitDialog";
import { alreadyReviewedLabel } from "@/components/approvals/approval-format";
import type { ExpenseReviewActions } from "@/components/expenses/ledger/ExpenseDetail";
import type { ExpenseListItem } from "@/types/expense";

export interface ApprovalActionsOptions {
  /**
   * The latest version of an expense: the server's answer to a review or
   * resubmit, its re-read after a conflict, or (bulk) the reviewed status.
   * Replace the expense in the page's list with it.
   */
  onUpdated?: (expense: ExpenseListItem) => void;
  /** The expense no longer exists (deleted meanwhile): drop it. */
  onRemoved?: (id: string) => void;
  /**
   * Called as an approve or reject starts its undo window (the expenses are in
   * `inFlight` from now on), e.g. to move the selection on to the next one.
   */
  onScheduled?: (expenses: ExpenseListItem[], action: ReviewAction) => void;
  /** Show the A / R keyboard shortcuts on Approve / Reject (the review queue). */
  shortcuts?: boolean;
}

export interface ApprovalActions {
  /** Ids whose approve/reject is in its undo window or being sent, with the action. */
  inFlight: Record<string, ReviewAction>;
  /** The signed-in user can approve and reject. */
  canReview: boolean;
  /** Approves now, with Undo for `UNDO_WINDOW_MS`; one request for several (bulk). */
  approve: (expenses: ExpenseListItem[]) => void;
  /** Rejects with one shared reason (3–500 characters), with Undo. */
  reject: (expenses: ExpenseListItem[], reason: string) => void;
  /** Opens the reject dialog (reason required) for one or more expenses. */
  openReject: (expenses: ExpenseListItem[]) => void;
  /** Opens "Resubmit as is" for the submitter's rejected expense. */
  openResubmit: (expense: ExpenseListItem) => void;
  /** Sends a rejected expense back for approval now; true once it is pending again. */
  resubmit: (expense: ExpenseListItem, note: string | null) => Promise<boolean>;
  /** Sends every review still in its undo window, and waits for those in flight. */
  flush: () => Promise<void>;
  /** Props for `ExpenseDetail` (and the rows that render it): its approval buttons. */
  handlers: ExpenseReviewActions;
  /** The reject and resubmit dialogs; render once on the page. */
  dialogs: ReactNode;
}

interface BulkResult {
  done: string[];
  failed: { id: string; code?: string; error?: string }[];
}

const VERB: Record<ReviewAction, { done: string; doing: string; status: ApprovalStatus }> = {
  approve: { done: "Approved", doing: "approve", status: "approved" },
  reject: { done: "Rejected", doing: "reject", status: "rejected" },
};

const revisionOf = (expense: ExpenseListItem) => expense.assetAllocationRevision ?? 0;

const errorCode = (error: unknown): string | undefined =>
  error instanceof ApiError ? error.code ?? (error.status === 404 ? "not_found" : undefined) : undefined;

const errorStatus = (error: unknown): ApprovalStatus | undefined => {
  const status = error instanceof ApiError ? (error.data as { approvalStatus?: unknown } | null)?.approvalStatus : undefined;
  return status === "pending" || status === "approved" || status === "rejected" ? status : undefined;
};

const plural = (n: number, word: string) => `${n} ${word}${n !== 1 ? "s" : ""}`;

/**
 * Approve / reject / resubmit for any page that lists expenses (the review
 * queue, Expenses, a trip). Approve and reject are deferred like deletes: the
 * page hides or re-labels the expenses in `inFlight` at once, a toast offers
 * Undo, and the request goes out when the window lapses (or on `flush` /
 * unmount). Conflicts come back in plain words: a "stale" expense (changed
 * since it was loaded) is re-read and handed to `onUpdated`; one another admin
 * already reviewed is re-read the same way; a bulk request reports how many
 * went through. Every settled review refreshes the nav's approval count.
 */
export function useApprovalActions(options: ApprovalActionsOptions = {}): ApprovalActions {
  const { user } = useAuth();
  const reviewer = Boolean(user && canReview(user.role));
  const { toast } = useToast();
  const { refresh } = useApprovalCount();
  const { schedule, undo, flush } = usePendingCommits(UNDO_WINDOW_MS);

  // Refs, so the callbacks below keep one identity while their inputs change.
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const userRef = useRef(user);
  userRef.current = user;

  const inFlightRef = useRef(new Map<string, ReviewAction>());
  const [inFlight, setInFlight] = useState<Record<string, ReviewAction>>({});
  const batch = useRef(0);

  const [rejectTargets, setRejectTargets] = useState<ExpenseListItem[] | null>(null);
  const [resubmitTarget, setResubmitTarget] = useState<ExpenseListItem | null>(null);
  const [resubmitting, setResubmitting] = useState(false);

  const syncInFlight = useCallback(() => setInFlight(Object.fromEntries(inFlightRef.current)), []);

  const release = useCallback(
    (ids: string[]) => {
      ids.forEach((id) => inFlightRef.current.delete(id));
      syncInFlight();
    },
    [syncInFlight]
  );

  /** Re-reads an expense after a conflict; drops it if it is gone. */
  const reload = useCallback(async (expense: ExpenseListItem, fallbackStatus?: ApprovalStatus) => {
    try {
      const data = await api.get(`/api/expenses/${expense._id}`);
      if (data?.expense) optionsRef.current.onUpdated?.({ ...expense, ...data.expense });
    } catch (error) {
      if (errorCode(error) === "not_found") optionsRef.current.onRemoved?.(expense._id);
      // Can't re-read it: at least show the status the server reported.
      else if (fallbackStatus) optionsRef.current.onUpdated?.({ ...expense, approvalStatus: fallbackStatus });
    }
  }, []);

  /** What a single review's failure means, in words, and the row brought up to date. */
  const settleFailure = useCallback(
    async (expense: ExpenseListItem, action: ReviewAction, error: unknown) => {
      const code = errorCode(error);
      const say = toastRef.current;
      if (code === "stale") {
        const who = expense.createdBy?.name || "Someone";
        say(`${who} changed this expense after you opened it — review the latest version.`, "error");
        await reload(expense, errorStatus(error));
      } else if (code === "not_pending") {
        const status = errorStatus(error);
        say(`Already ${alreadyReviewedLabel(status)} by another admin.`, "info");
        await reload(expense, status);
      } else if (code === "not_found") {
        say(`"${expense.title}" no longer exists, so there's nothing to review.`, "info");
        optionsRef.current.onRemoved?.(expense._id);
      } else {
        const detail = error instanceof ApiError ? error.message : "Check your connection and try again.";
        say(`Couldn't ${VERB[action].doing} "${expense.title}". ${detail}`, "error");
      }
    },
    [reload]
  );

  /** Sends a bulk review in chunks the server accepts; a chunk that fails outright counts as failed. */
  const sendBulk = useCallback(async (expenses: ExpenseListItem[], action: ReviewAction, reason?: string) => {
    const result: BulkResult = { done: [], failed: [] };
    let lastError: unknown = null;
    for (let i = 0; i < expenses.length; i += MAX_BULK_REVIEW) {
      const chunk = expenses.slice(i, i + MAX_BULK_REVIEW);
      try {
        const data: BulkResult = await api.post("/api/expenses/approvals", {
          action,
          items: chunk.map((e) => ({ id: e._id, revision: revisionOf(e) })),
          ...(reason ? { reason } : {}),
        });
        result.done.push(...(data.done ?? []));
        result.failed.push(...(data.failed ?? []));
      } catch (error) {
        lastError = error;
        result.failed.push(
          ...chunk.map((e) => ({ id: e._id, code: errorCode(error), error: error instanceof Error ? error.message : undefined }))
        );
      }
    }
    // Nothing went through: report it as one failure.
    if (result.done.length === 0 && lastError) throw lastError;
    return result;
  }, []);

  const review = useCallback(
    (targets: ExpenseListItem[], action: ReviewAction, reason?: string) => {
      const expenses = targets.filter(
        (e) => !inFlightRef.current.has(e._id) && effectiveApprovalStatus(e) === "pending"
      );
      if (expenses.length === 0) return;
      const ids = expenses.map((e) => e._id);
      const single = expenses.length === 1 ? expenses[0] : null;
      const key = single ? single._id : `batch:${++batch.current}`;
      const verb = VERB[action];

      const run = single
        ? () =>
            api.post(`/api/expenses/${single._id}/approval`, {
              action,
              revision: revisionOf(single),
              ...(reason ? { reason } : {}),
            }) as Promise<{ expense?: ExpenseListItem }>
        : () => sendBulk(expenses, action, reason);

      const scheduled = schedule<unknown>(key, run, {
        onUndo: () => release(ids),
        onCommitted: async (result) => {
          if (single) {
            const updated = (result as { expense?: ExpenseListItem } | undefined)?.expense;
            optionsRef.current.onUpdated?.(
              updated ? { ...single, ...updated } : { ...single, approvalStatus: verb.status }
            );
            release(ids);
            refreshRef.current();
            return;
          }
          const { done, failed } = result as BulkResult;
          const byId = new Map(expenses.map((e) => [e._id, e]));
          const me = userRef.current;
          const now = new Date().toISOString();
          done.forEach((id) => {
            const expense = byId.get(id);
            if (!expense) return;
            optionsRef.current.onUpdated?.({
              ...expense,
              approvalStatus: verb.status,
              rejectionReason: action === "reject" ? reason ?? null : null,
              reviewedAt: now,
              reviewedBy: me ? { _id: me._id, name: me.name, email: me.email } : null,
            });
          });
          if (failed.length > 0) {
            // Bring the ones that didn't go through up to date before they show again.
            await Promise.all(
              failed.map((f) => {
                const expense = byId.get(f.id);
                if (!expense) return undefined;
                if (f.code === "not_found") {
                  optionsRef.current.onRemoved?.(f.id);
                  return undefined;
                }
                return reload(expense);
              })
            );
            const count = (code?: string) => failed.filter((f) => f.code === code).length;
            const already = count("not_pending");
            const gone = count("not_found");
            const changed = failed.length - already - gone;
            const parts = [
              changed > 0 && `${changed} changed and ${changed === 1 ? "needs" : "need"} another look`,
              already > 0 && `${already} ${already === 1 ? "was" : "were"} already reviewed by another admin`,
              gone > 0 && `${gone} no longer ${gone === 1 ? "exists" : "exist"}`,
            ].filter(Boolean);
            toastRef.current(
              `${verb.done} ${done.length} of ${expenses.length}. ${parts.join(". ")}.`,
              changed > 0 ? "error" : "info"
            );
          }
          release(ids);
          refreshRef.current();
        },
        onFailed: async (error) => {
          if (single) {
            await settleFailure(single, action, error);
          } else {
            const detail = error instanceof ApiError ? error.message : "Check your connection and try again.";
            toastRef.current(`Couldn't ${verb.doing} ${plural(expenses.length, "expense")}. ${detail}`, "error");
          }
          release(ids);
          refreshRef.current();
        },
      });
      if (!scheduled) return;

      ids.forEach((id) => inFlightRef.current.set(id, action));
      syncInFlight();
      optionsRef.current.onScheduled?.(expenses, action);

      const submitters = [...new Set(expenses.map((e) => e.createdBy?.name).filter(Boolean))];
      const subject = single ? `"${single.title}"` : plural(expenses.length, "expense");
      const message =
        action === "approve"
          ? `${verb.done} ${subject}`
          : `${verb.done} ${subject} — ${submitters.length === 1 ? submitters[0] : "the submitters"} will see your reason`;
      toastRef.current(message, action === "approve" ? "success" : "info", {
        durationMs: UNDO_WINDOW_MS,
        action: { label: "Undo", onClick: () => void undo(key) },
      });
    },
    [release, reload, schedule, sendBulk, settleFailure, syncInFlight, undo]
  );

  const approve = useCallback((expenses: ExpenseListItem[]) => review(expenses, "approve"), [review]);
  const reject = useCallback(
    (expenses: ExpenseListItem[], reason: string) => review(expenses, "reject", reason),
    [review]
  );

  const openReject = useCallback((expenses: ExpenseListItem[]) => {
    const pending = expenses.filter((e) => effectiveApprovalStatus(e) === "pending" && !inFlightRef.current.has(e._id));
    if (pending.length > 0) setRejectTargets(pending);
  }, []);

  const openResubmit = useCallback((expense: ExpenseListItem) => setResubmitTarget(expense), []);

  /** "pending" (sent back), "closed" (changed under us or refused: nothing to retry) or "retry". */
  const sendResubmit = useCallback(
    async (expense: ExpenseListItem, note: string | null): Promise<"pending" | "closed" | "retry"> => {
      setResubmitting(true);
      try {
        const data = await api.post(`/api/expenses/${expense._id}/approval`, {
          action: "resubmit",
          revision: revisionOf(expense),
          ...(note ? { note } : {}),
        });
        optionsRef.current.onUpdated?.(
          data?.expense ? { ...expense, ...data.expense } : { ...expense, approvalStatus: "pending" }
        );
        toastRef.current("Resubmitted. An admin will review it again.");
        refreshRef.current();
        return "pending";
      } catch (error) {
        const code = errorCode(error);
        const say = toastRef.current;
        if (code === "stale") {
          say("This expense changed after you opened it. Check the latest version, then resubmit.", "error");
          await reload(expense);
          return "closed";
        }
        if (code === "not_rejected") {
          say("This expense isn't rejected any more, so there's nothing to resubmit.", "info");
          await reload(expense);
          return "closed";
        }
        if (code === "forbidden") {
          say("Only the person who submitted this expense can resubmit it.", "error");
          return "closed";
        }
        if (code === "not_found") {
          say(`"${expense.title}" no longer exists.`, "info");
          optionsRef.current.onRemoved?.(expense._id);
          return "closed";
        }
        say(error instanceof ApiError ? error.message : "Couldn't resubmit. Check your connection and try again.", "error");
        return "retry";
      } finally {
        setResubmitting(false);
      }
    },
    [reload]
  );

  const resubmit = useCallback(
    async (expense: ExpenseListItem, note: string | null) => (await sendResubmit(expense, note)) === "pending",
    [sendResubmit]
  );

  const handlers = useMemo<ExpenseReviewActions>(
    () => ({
      onApprove: reviewer ? (expense) => approve([expense]) : undefined,
      onReject: reviewer ? (expense) => openReject([expense]) : undefined,
      onResubmit: openResubmit,
      viewerId: user?._id,
      inFlight,
      shortcuts: options.shortcuts,
    }),
    [approve, inFlight, openReject, openResubmit, options.shortcuts, reviewer, user?._id]
  );

  const dialogs = (
    <>
      <RejectDialog
        isOpen={rejectTargets !== null}
        expenses={rejectTargets ?? []}
        onClose={() => setRejectTargets(null)}
        onConfirm={(reason) => {
          const targets = rejectTargets ?? [];
          setRejectTargets(null);
          reject(targets, reason);
        }}
      />
      <ResubmitDialog
        isOpen={resubmitTarget !== null}
        expense={resubmitTarget}
        busy={resubmitting}
        onClose={() => setResubmitTarget(null)}
        onConfirm={async (note) => {
          if (!resubmitTarget) return;
          if ((await sendResubmit(resubmitTarget, note)) !== "retry") setResubmitTarget(null);
        }}
      />
    </>
  );

  return {
    inFlight,
    canReview: reviewer,
    approve,
    reject,
    openReject,
    openResubmit,
    resubmit,
    flush,
    handlers,
    dialogs,
  };
}
