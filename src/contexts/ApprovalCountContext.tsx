"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";

export interface ApprovalCount {
  /** Expenses waiting for an admin, across the whole organization. */
  count: number;
  /** Their total in base currency. */
  pendingAmount: number;
  /** When the oldest of them was submitted (ISO), or null. */
  oldestPendingAt: string | null;
  /** Re-reads the count (after an approve, reject or resubmit). */
  refresh: () => void;
}

const EMPTY: ApprovalCount = { count: 0, pendingAmount: 0, oldestPendingAt: null, refresh: () => {} };

const ApprovalCountContext = createContext<ApprovalCount>(EMPTY);

/**
 * The admin's "awaiting approval" count for the nav badges and the queue
 * header. Read on mount, on every route change and when the window regains
 * focus; never polled. Off (always zero) for non-admins, and outside the
 * provider (tests, pages rendered alone).
 */
export function ApprovalCountProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const pathname = usePathname();
  const [state, setState] = useState<Omit<ApprovalCount, "refresh">>(EMPTY);
  /** Only the newest request may land, so a slow one never overwrites a later count. */
  const generation = useRef(0);

  const refresh = useCallback(() => {
    if (!enabled) return;
    const current = ++generation.current;
    api
      .get("/api/expenses/approvals")
      .then((data: { pendingCount?: number; pendingAmount?: number; oldestPendingAt?: string | null }) => {
        if (current !== generation.current) return;
        setState({
          count: Math.max(0, Number(data?.pendingCount) || 0),
          pendingAmount: Number(data?.pendingAmount) || 0,
          oldestPendingAt: data?.oldestPendingAt ?? null,
        });
      })
      .catch(() => {
        // Non-critical: keep the last count; the next route change or focus retries.
      });
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      generation.current += 1;
      setState(EMPTY);
      return;
    }
    refresh();
  }, [enabled, pathname, refresh]);

  useEffect(() => {
    if (!enabled) return;
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [enabled, refresh]);

  const value = useMemo(() => ({ ...state, refresh }), [state, refresh]);
  return <ApprovalCountContext.Provider value={value}>{children}</ApprovalCountContext.Provider>;
}

export function useApprovalCount(): ApprovalCount {
  return useContext(ApprovalCountContext);
}

/** "4 awaiting approval": the count in words, for accessible names. */
export function approvalCountLabel(count: number): string {
  return `${count} awaiting approval`;
}
