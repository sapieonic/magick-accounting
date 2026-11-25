"use client";

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiError, api } from "@/lib/api";
import {
  MAX_BULK_REVIEW,
  canReview,
  canReviewExpense,
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
import ReopenDialog from "@/components/approvals/ReopenDialog";
import { alreadyReviewedLabel } from "@/components/approvals/approval-format";
import type { ExpenseReviewActions } from "@/components/expenses/ledger/ExpenseDetail";
import type { ExpenseListItem } from "@/types/expense";

export interface ApprovalActionsOptions {
  /**
   * The latest version of an expense: the server's answer to a review,
   * resubmit or reopen, its re-read after a conflict, or (bulk) the reviewed
   * status. Replace the expense in the page's list with it.
   */
  onUpdated?: (expense: ExpenseListItem) => void;
  /** The expense no longer exists (deleted meanwhile): drop it. */
  onRemoved?: (id: string) => void;
  /**
   * Called as an approve or reject starts its undo window (the expenses are in
   * `inFlight` from now on), e.g. to move the selection on to the next one.
   */
  onScheduled?: (expenses: ExpenseListItem[], action: ReviewAction) => void;
  /**
   * A single approve or reject didn't go through and the expense is awaiting
   * approval again (it changed meanwhile, the request failed, or it was
   * refused), already brought up to date through `onUpdated`. The review
   * queue uses it to bring the expense back into view.
   */
  onReturned?: (expense: ExpenseListItem) => void;
  /** Show the A / R keyboard shortcuts on Approve / Reject (the review queue, while they're on). */
  shortcuts?: boolean;
}

export interface ApprovalActions {
  /** Ids whose approve/reject is in its undo window or being sent, with the action. */
  inFlight: Record<string, ReviewAction>;
  /** Approves now, with Undo for `UNDO_WINDOW_MS`; one request for several (bulk). Skips the viewer's own. */
  approve: (expenses: ExpenseListItem[]) => void;
  /** Opens the reject dialog (reason required) for one or more expenses; the reject has Undo. */
  openReject: (expenses: ExpenseListItem[]) => void;
  /** Opens "Resubmit as is" for the submitter's rejected expense. */
  openResubmit: (expense: ExpenseListItem) => void;
  /** Sends a rejected expense back for approval now (no dialog); true once it is pending again. */
  resubmit: (expense: ExpenseListItem, note: string | null) => Promise<boolean>;
  /** Sends every review still in its undo window, and waits for those in flight. */
  flush: () => Promise<void>;
  /** Props for `ExpenseDetail` (and the rows that render it): its approval buttons. */
  handlers: ExpenseReviewActions;
  /** The reject, resubmit and "move back to review" dialogs; render once on the page. */
  dialogs: ReactNode;
}

interface BulkFailure {
  id: string;
  code?: string;
  error?: string;
  /** The request carrying it failed as a whole (offline, server error): nothing is known about it. */
  unsent?: boolean;
}

interface BulkResult {
  done: string[];
  failed: BulkFailure[];
}

const VERB: Record<ReviewAction, { done: string; doing: string; status: ApprovalStatus; past: string }> = {
  approve: { done: "Approved", doing: "approve", status: "approved", past: "approved" },
  reject: { done: "Rejected", doing: "reject", status: "rejected", past: "rejected" },
};

const OWN_EXPENSE = "You can't review your own expense. Another admin needs to approve or reject it.";
const OFFLINE = "Check your connection and try again.";

const revisionOf = (expense: ExpenseListItem) => expense.assetAllocationRevision ?? 0;

const errorCode = (error: unknown): string | undefined =>
  error instanceof ApiError ? error.code ?? (error.status === 404 ? "not_found" : undefined) : undefined;

const errorStatus = (error: unknown): ApprovalStatus | undefined => {
  const status = error instanceof ApiError ? (error.data as { approvalStatus?: unknown } | null)?.approvalStatus : undefined;
  return status === "pending" || status === "approved" || status === "rejected" ? status : undefined;
};

const plural = (n: number, word: string) => `${n} ${word}${n !== 1 ? "s" : ""}`;

/** "1 is your own" / "2 are your own": a count with its verb. */
const counted = (n: number, singular: string, pluralForm: string) => `${n} ${n === 1 ? singular : pluralForm}`;

/**
 * Approve / reject / resubmit / move back to review for any page that lists
 * expenses (the review queue, Expenses, a trip). Approve and reject are
 * deferred like deletes: the page hides or re-labels the expenses in
 * `inFlight` at once, a toast offers Undo, and the request goes out when the
 * window lapses (or on `flush` / unmount), closing that toast; an Undo that
 * comes too late says so. "Move back to review" is confirmed in a dialog and
 * sent at once. Conflicts come back in plain words: a "stale" expense
 * (changed since it was loaded) is re-read and handed to `onUpdated`; one
 * another admin already reviewed is re-read the same way; a bulk request
 * reports how many went through and why the rest didn't. Admins can't review
 * their own expenses. Every settled change refreshes the nav's approval count.
 */
export function useApprovalActions(options: ApprovalActionsOptions = {}): ApprovalActions {
  const { user } = useAuth();
  const reviewer = Boolean(user && canReview(user.role));
  const { toast, dismiss } = useToast();
  const { refresh } = useApprovalCount();
  const { schedule, undo, flush } = usePendingCommits(UNDO_WINDOW_MS);

  // Refs, so the callbacks below keep one identity while their inputs change.
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;
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
  const [reopenTarget, setReopenTarget] = useState<ExpenseListItem | null>(null);
  const [reopening, setReopening] = useState(false);

  const syncInFlight = useCallback(() => setInFlight(Object.fromEntries(inFlightRef.current)), []);

  const release = useCallback(
    (ids: string[]) => {
      ids.forEach((id) => inFlightRef.current.delete(id));
      syncInFlight();
    },
    [syncInFlight]
  );

  /** The viewer may approve or reject it: an admin, and not its submitter. */
  const mayReview = useCallback((expense: ExpenseListItem) => {
    const me = userRef.current;
    return Boolean(me && canReviewExpense(me, expense));
  }, []);

  /**
   * The pending expenses among `targets` the viewer may review now. Says why
   * when the viewer's own expense is all there is.
   */
  const reviewable = useCallback(
    (targets: ExpenseListItem[]) => {
      const open = targets.filter((e) => !inFlightRef.current.has(e._id) && effectiveApprovalStatus(e) === "pending");
      const allowed = open.filter(mayReview);
      if (allowed.length === 0 && open.length > 0) toastRef.current(OWN_EXPENSE, "info");
      return allowed;
    },
    [mayReview]
  );

  /** Re-reads an expense after a conflict; drops it if it is gone. Resolves to the latest version, if any. */
  const reload = useCallback(
    async (expense: ExpenseListItem, fallbackStatus?: ApprovalStatus): Promise<ExpenseListItem | null> => {
      try {
        const data = await api.get(`/api/expenses/${expense._id}`);
        if (!data?.expense) return null;
        const latest = { ...expense, ...data.expense };
        optionsRef.current.onUpdated?.(latest);
        return latest;
      } catch (error) {
        if (errorCode(error) === "not_found") {
          optionsRef.current.onRemoved?.(expense._id);
          return null;
        }
        // Can't re-read it: at least show the status the server reported.
        if (!fallbackStatus) return null;
        const reported = { ...expense, approvalStatus: fallbackStatus };
        optionsRef.current.onUpdated?.(reported);
        return reported;
      }
    },
    []
  );

  /**
   * What a single review's failure means, in words, with the expense brought
   * up to date. Resolves to the expense when it is awaiting approval again.
   */
  const settleFailure = useCallback(
    async (expense: ExpenseListItem, action: ReviewAction, error: unknown): Promise<ExpenseListItem | null> => {
      const code = errorCode(error);
      const say = toastRef.current;
      const stillPending = (latest: ExpenseListItem | null) =>
        latest && effectiveApprovalStatus(latest) === "pending" ? latest : null;
      if (code === "stale") {
        say("This expense changed after you opened it — review the latest version.", "error");
        return stillPending(await reload(expense, errorStatus(error)));
      }
      if (code === "not_pending") {
        const status = errorStatus(error);
        say(`Already ${alreadyReviewedLabel(status)} by another admin.`, "info");
        return stillPending(await reload(expense, status));
      }
      if (code === "not_found") {
        say(`"${expense.title}" no longer exists, so there's nothing to review.`, "info");
        optionsRef.current.onRemoved?.(expense._id);
        return null;
      }
      if (code === "own_expense") {
        say(OWN_EXPENSE, "error");
        return expense;
      }
      const detail = error instanceof ApiError ? error.message : OFFLINE;
      say(`Couldn't ${VERB[action].doing} "${expense.title}". ${detail}`, "error");
      return expense;
    },
    [reload]
  );

  /**
   * Sends a bulk review in chunks the server accepts. A chunk whose request
   * fails as a whole is marked `unsent`; if every chunk fails, the error is thrown.
   */
  const sendBulk = useCallback(async (expenses: ExpenseListItem[], action: ReviewAction, reason?: string) => {
    const result: BulkResult = { done: [], failed: [] };
    let lastError: unknown = null;
    let sentChunks = 0;
    for (let i = 0; i < expenses.length; i += MAX_BULK_REVIEW) {
      const chunk = expenses.slice(i, i + MAX_BULK_REVIEW);
      try {
        const data: BulkResult = await api.post("/api/expenses/approvals", {
          action,
          items: chunk.map((e) => ({ id: e._id, revision: revisionOf(e) })),
          ...(reason ? { reason } : {}),
        });
        sentChunks += 1;
        result.done.push(...(data.done ?? []));
        result.failed.push(...(data.failed ?? []));
      } catch (error) {
        lastError = error;
        result.failed.push(
          ...chunk.map((e) => ({ id: e._id, unsent: true, error: error instanceof Error ? error.message : undefined }))
        );
      }
    }
    if (sentChunks === 0 && lastError) throw lastError;
    return result;
  }, []);

  /** Brings a bulk review's failures up to date, and says in one toast what happened. */
  const settleBulk = useCallback(
    async (expenses: ExpenseListItem[], action: ReviewAction, { done, failed }: BulkResult) => {
      const verb = VERB[action];
      const byId = new Map(expenses.map((e) => [e._id, e]));
      await Promise.all(
        failed.map((f) => {
          const expense = byId.get(f.id);
          if (!expense) return undefined;
          if (f.code === "not_found") {
            optionsRef.current.onRemoved?.(f.id);
            return undefined;
          }
          // Unsent or refused as the viewer's own: nothing changed on the server.
          if (f.unsent || f.code === "own_expense") return undefined;
          return reload(expense);
        })
      );
      const unsent = failed.filter((f) => f.unsent).length;
      const count = (code: string) => failed.filter((f) => !f.unsent && f.code === code).length;
      const already = count("not_pending");
      const gone = count("not_found");
      const own = count("own_expense");
      const changed = failed.length - unsent - already - gone - own;
      const parts = [
        changed > 0 && `${counted(changed, "changed and needs", "changed and need")} another look`,
        already > 0 && `${counted(already, "was", "were")} already reviewed by another admin`,
        gone > 0 && `${gone} no longer ${gone === 1 ? "exists" : "exist"}`,
        own > 0 && `${counted(own, "is", "are")} your own — another admin needs to review ${own === 1 ? "it" : "them"}`,
        unsent > 0 && `${unsent} couldn't be sent. Check your connection and try again`,
      ].filter(Boolean);
      toastRef.current(
        `${verb.done} ${done.length} of ${expenses.length}. ${parts.join(". ")}.`,
        changed > 0 || unsent > 0 ? "error" : "info"
      );
    },
    [reload]
  );

  const review = useCallback(
    (targets: ExpenseListItem[], action: ReviewAction, reason?: string) => {
      const expenses = reviewable(targets);
      if (expenses.length === 0) return;
      const ids = expenses.map((e) => e._id);
      const single = expenses.length === 1 ? expenses[0] : null;
      const key = single ? single._id : `batch:${++batch.current}`;
      const verb = VERB[action];
      /** The Undo toast, closed once the request goes out. */
      let undoToast: string | undefined;

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
        onSent: () => {
          if (undoToast) dismissRef.current?.(undoToast);
        },
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
          const bulk = result as BulkResult;
          const byId = new Map(expenses.map((e) => [e._id, e]));
          const me = userRef.current;
          const now = new Date().toISOString();
          bulk.done.forEach((id) => {
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
          if (bulk.failed.length > 0) await settleBulk(expenses, action, bulk);
          release(ids);
          refreshRef.current();
        },
        onFailed: async (error) => {
          let returned: ExpenseListItem | null = null;
          if (single) {
            returned = await settleFailure(single, action, error);
          } else {
            const detail = error instanceof ApiError ? error.message : OFFLINE;
            toastRef.current(`Couldn't ${verb.doing} ${plural(expenses.length, "expense")}. ${detail}`, "error");
          }
          release(ids);
          if (returned) optionsRef.current.onReturned?.(returned);
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
      const tooLate = single
        ? `Too late to undo — it's already ${verb.past}. You can move it back to review from its details.`
        : `Too late to undo — they're already ${verb.past}. You can move each one back to review from its details.`;
      undoToast = toastRef.current(message, action === "approve" ? "success" : "info", {
        durationMs: UNDO_WINDOW_MS,
        action: {
          label: "Undo",
          onClick: () => {
            if (!undo(key)) toastRef.current(tooLate, "info");
          },
        },
      });
    },
    [release, reviewable, schedule, sendBulk, settleBulk, settleFailure, syncInFlight, undo]
  );

  const approve = useCallback((expenses: ExpenseListItem[]) => review(expenses, "approve"), [review]);

  const openReject = useCallback(
    (expenses: ExpenseListItem[]) => {
      const targets = reviewable(expenses);
      if (targets.length > 0) setRejectTargets(targets);
    },
    [reviewable]
  );

  const openResubmit = useCallback((expense: ExpenseListItem) => setResubmitTarget(expense), []);

  /** "done" (it changed), "closed" (changed under us or refused: nothing to retry) or "retry". */
  type Outcome = "done" | "closed" | "retry";

  const sendResubmit = useCallback(
    async (expense: ExpenseListItem, note: string | null): Promise<Outcome> => {
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
        return "done";
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
        say(error instanceof ApiError ? error.message : `Couldn't resubmit. ${OFFLINE}`, "error");
        return "retry";
      } finally {
        setResubmitting(false);
      }
    },
    [reload]
  );

  const resubmit = useCallback(
    async (expense: ExpenseListItem, note: string | null) => (await sendResubmit(expense, note)) === "done",
    [sendResubmit]
  );

  /** Moves an approved or rejected expense back to awaiting approval (confirmed, so no undo window). */
  const sendReopen = useCallback(
    async (expense: ExpenseListItem, note: string | null): Promise<Outcome> => {
      setReopening(true);
      try {
        const data = await api.post(`/api/expenses/${expense._id}/approval`, {
          action: "reopen",
          revision: revisionOf(expense),
          ...(note ? { note } : {}),
        });
        optionsRef.current.onUpdated?.(
          data?.expense
            ? { ...expense, ...data.expense }
            : { ...expense, approvalStatus: "pending", reviewedBy: null, reviewedAt: null, rejectionReason: null }
        );
        toastRef.current(`Moved "${expense.title}" back to review. It's awaiting approval again.`);
        refreshRef.current();
        return "done";
      } catch (error) {
        const code = errorCode(error);
        const say = toastRef.current;
        if (code === "not_reviewed") {
          say("This expense is already awaiting approval.", "info");
          await reload(expense, "pending");
          return "closed";
        }
        if (code === "asset_linked") {
          say("Assets are registered against this expense, so it can't go back to review. Reverse its assets first.", "error");
          return "closed";
        }
        if (code === "stale") {
          say("This expense changed after you opened it — check the latest version, then try again.", "error");
          await reload(expense);
          return "closed";
        }
        if (code === "own_expense") {
          say("You can't move your own expense back to review. Another admin needs to do it.", "error");
          return "closed";
        }
        if (code === "forbidden") {
          say("Only admins can move an expense back to review.", "error");
          return "closed";
        }
        if (code === "not_found") {
          say(`"${expense.title}" no longer exists.`, "info");
          optionsRef.current.onRemoved?.(expense._id);
          return "closed";
        }
        say(error instanceof ApiError ? error.message : `Couldn't move it back to review. ${OFFLINE}`, "error");
        return "retry";
      } finally {
        setReopening(false);
      }
    },
    [reload]
  );

  const openReopen = useCallback(
    (expense: ExpenseListItem) => {
      if (mayReview(expense)) setReopenTarget(expense);
      else toastRef.current("You can't move your own expense back to review. Another admin needs to do it.", "info");
    },
    [mayReview]
  );

  const handlers = useMemo<ExpenseReviewActions>(
    () => ({
      onApprove: reviewer ? (expense) => approve([expense]) : undefined,
      onReject: reviewer ? (expense) => openReject([expense]) : undefined,
      onReopen: reviewer ? openReopen : undefined,
      onResubmit: openResubmit,
      viewerId: user?._id,
      viewerRole: user?.role,
      inFlight,
      shortcuts: options.shortcuts,
    }),
    [approve, inFlight, openReject, openReopen, openResubmit, options.shortcuts, reviewer, user?._id, user?.role]
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
          review(targets, "reject", reason);
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
      <ReopenDialog
        isOpen={reopenTarget !== null}
        expense={reopenTarget}
        busy={reopening}
        onClose={() => setReopenTarget(null)}
        onConfirm={async (note) => {
          if (!reopenTarget) return;
          if ((await sendReopen(reopenTarget, note)) !== "retry") setReopenTarget(null);
        }}
      />
    </>
  );

  return {
    inFlight,
    approve,
    openReject,
    openResubmit,
    resubmit,
    flush,
    handlers,
    dialogs,
  };
}
