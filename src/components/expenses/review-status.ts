"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { ApprovalStatus, ReviewAction } from "@/lib/approval";
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
