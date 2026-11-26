"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { canDeleteExpense, type ApprovalStatus, type ReviewAction, type Role } from "@/lib/approval";
import type { ExpenseListItem } from "@/types/expense";

/**
 * The status an approve or reject in its undo window will leave the expense
 * in. Expenses and the trip page show it (and move their totals) until the
 * request settles; Undo drops the expense from `inFlight` again.
 */
export const REVIEWED_STATUS: Record<ReviewAction, Extract<ApprovalStatus, "approved" | "rejected">> = {
  approve: "approved",
  reject: "rejected",
};

/** `expense` as it will be once the review in its undo window goes through. */
export function asReviewed<T extends ExpenseListItem>(expense: T, action: ReviewAction): T {
  return { ...expense, approvalStatus: REVIEWED_STATUS[action] };
}

/** Said when Delete is pressed on an expense whose approve/reject can still be undone. */
export const DELETE_WHILE_REVIEWING =
  "This expense's review is still being saved. Undo it first, or wait a few seconds, then delete it.";

/** What an expense's row and detail offer where Delete goes. */
export type DeleteOffer = "delete" | "locked" | "none";

/**
 * Whether to offer Delete for `expense` (the stored row).
 * - "none": the page gave no `onDelete`, or the expense's approve/reject is in
 *   its undo window (the row then shows the status it's heading for, so
 *   nothing is decided from it until the server has it);
 * - "locked": the viewer may not delete it (`canDeleteExpense`: approved
 *   spend, legacy included, is only the master admin's to delete), so the
 *   detail says why instead of showing a dead button;
 * - "delete" otherwise. Without a known viewer it offers Delete and leaves
 *   the rule to the server.
 */
export function deleteOffer(
  expense: ExpenseListItem,
  actions: {
    onDelete?: unknown;
    review?: { viewerId?: string; viewerRole?: Role; inFlight?: Record<string, ReviewAction> };
  }
): DeleteOffer {
  const { onDelete, review } = actions;
  if (!onDelete || review?.inFlight?.[expense._id]) return "none";
  if (!review?.viewerId || !review.viewerRole) return "delete";
  return canDeleteExpense({ _id: review.viewerId, role: review.viewerRole }, expense) ? "delete" : "locked";
}

/** Delete refusals the server explains in words (and that a re-read of the expense brings up to date). */
const EXPLAINED_DELETE_REFUSALS = new Set(["approved_locked", "asset_linked", "stale", "not_found"]);

/**
 * The server's own words for a delete it refused under a rule (approved and
 * not the master admin's, assets registered meanwhile, changed, gone), or
 * null for anything else (no answer, a server error).
 */
export function deleteRefusal(error: unknown): string | null {
  const code = (error as { code?: unknown } | null)?.code;
  return error instanceof Error && typeof code === "string" && EXPLAINED_DELETE_REFUSALS.has(code) && error.message
    ? error.message
    : null;
}

export const DELETE_FAILED = "Failed to delete expense";

function focusWasLost(): boolean {
  const active = document.activeElement as HTMLElement | null;
  return (
    !active ||
    active === document.body ||
    active.id === "main" ||
    !active.isConnected ||
    (active as HTMLButtonElement).disabled === true
  );
}

/**
 * Keeps keyboard focus on the list after an approve or reject. Those buttons
 * turn off while the decision can be undone (and the reject dialog hands focus
 * back to its now-disabled opener), so focus would drop to the page; after a
 * "move back to review" or a resubmit, the button that opened the dialog is
 * gone altogether (it only shows on a reviewed expense). `after(id)`
 * moves it, once the page has re-rendered, to that expense's row title, or to
 * `fallback` (e.g. the ledger) when the row left the list. Focus the person
 * already moved somewhere else is left alone.
 */
export function useFocusAfterReview(fallback: RefObject<HTMLElement | null>) {
  const target = useRef<string | null>(null);
  const [request, setRequest] = useState(0);

  useEffect(() => {
    const id = target.current;
    if (!id) return;
    target.current = null;
    // After the dialog layer (if any) has returned focus to its opener.
    const timer = window.setTimeout(() => {
      if (!focusWasLost()) return;
      const title = document.querySelector<HTMLElement>(
        `[data-expense-row="${id.replace(/["\\]/g, "\\$&")}"] [data-row-title]`
      );
      (title ?? fallback.current)?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [request, fallback]);

  return useCallback((expenses: ExpenseListItem[]) => {
    if (expenses.length === 0) return;
    target.current = expenses[0]._id;
    setRequest((n) => n + 1);
  }, []);
}
