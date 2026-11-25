import { format, formatDistanceStrict } from "date-fns";
import {
  APPROVAL_HISTORY_LABEL,
  EDIT_RESUBMIT_NOTE,
  effectiveApprovalStatus,
  isSystemNote,
  type ApprovalStatus,
} from "@/lib/approval";
import type { ApprovalHistoryItem, ExpenseListItem } from "@/types/expense";

/**
 * Plain-language pieces of an expense's approval state, shared by the rows,
 * the detail and the review queue. Client-safe.
 */

/** A person as the API returns them: populated, a bare id, or missing. */
export type PersonRef = { _id: string; name?: string; email?: string } | string | null | undefined;

const idOf = (person: PersonRef): string | null =>
  person == null ? null : typeof person === "string" ? person : person._id;

/**
 * A populated person's name (or email). Bare ids and missing refs give
 * `fallback`, or `null` without one.
 */
export function personName(person: PersonRef, fallback: string): string;
export function personName(person: PersonRef, fallback?: string): string | null;
export function personName(person: PersonRef, fallback?: string): string | null {
  if (person && typeof person === "object" && (person.name || person.email)) {
    return person.name || person.email || null;
  }
  return fallback ?? null;
}

/**
 * A person's name from a populated ref, or from the expense's own submitter /
 * reviewer when the ref is a bare id (list rows don't populate the history).
 */
export function expensePersonName(person: PersonRef, expense: ExpenseListItem): string | null {
  const direct = personName(person);
  if (direct) return direct;
  const id = idOf(person);
  if (!id) return null;
  if (expense.createdBy?._id === id) return expense.createdBy.name;
  if (expense.reviewedBy && typeof expense.reviewedBy === "object" && expense.reviewedBy._id === id) {
    return personName(expense.reviewedBy);
  }
  return null;
}

/** "12 Nov 2026" — the one date format for approval events; `null` for a missing or invalid date. */
export function approvalDate(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : format(date, "d MMM yyyy");
}

/** "6 days ago", "less than a minute ago" → "just now". */
export function relativeTime(iso: string | null | undefined, now: Date = new Date()): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  if (Math.abs(now.getTime() - date.getTime()) < 60_000) return "just now";
  return `${formatDistanceStrict(date, now)} ago`;
}

/** When the expense last went to an admin: the latest (re)submission or reopen, else its creation. */
export function submittedAt(expense: ExpenseListItem): string | null {
  const history = expense.approvalHistory ?? [];
  for (let i = history.length - 1; i >= 0; i--) {
    const { action } = history[i];
    if (action === "submitted" || action === "resubmitted" || action === "reopened") return history[i].at;
  }
  return expense.createdAt ?? null;
}

/**
 * A note the server wrote itself (an edit that sent the expense back for
 * approval) as a verb phrase: "edited it after it was approved". `null` for
 * a person's own words.
 */
export function systemNoteText(note: string | null | undefined): string | null {
  if (!isSystemNote(note)) return null;
  return note === EDIT_RESUBMIT_NOTE.afterApproval ? "edited it after it was approved" : "edited it after it was rejected";
}

export interface ResubmissionNote {
  /** Who resubmitted it. */
  name: string | null;
  /** Their own words, or null when the note is the server's edit marker. */
  note: string | null;
  /** The edit marker as a verb phrase ("edited it after it was rejected"), else null. */
  edited: string | null;
}

/** The latest resubmission's note while the expense waits again, for the reviewer. */
export function latestResubmission(expense: ExpenseListItem): ResubmissionNote | null {
  if (effectiveApprovalStatus(expense) !== "pending") return null;
  const history = expense.approvalHistory ?? [];
  const last = history[history.length - 1];
  if (!last || last.action !== "resubmitted") return null;
  const edited = systemNoteText(last.note);
  const note = last.note && !edited ? last.note : null;
  if (!note && !edited) return null;
  return { name: expensePersonName(last.by, expense), note, edited };
}

/** The reviewer's name and the review date of an approved or rejected expense. */
export function reviewInfo(expense: ExpenseListItem): { name: string | null; date: string | null } {
  return { name: expensePersonName(expense.reviewedBy, expense), date: approvalDate(expense.reviewedAt) };
}

/** "Already approved", for a review another admin made first. */
export function alreadyReviewedLabel(status: ApprovalStatus | null | undefined): string {
  return status === "rejected" ? "rejected" : status === "approved" ? "approved" : "reviewed";
}

export interface HistoryLine {
  /** "Rejected · Priya · 12 Nov 2026". */
  summary: string;
  /** A person's note, to show as their words (quoted), else null. */
  quote: string | null;
  /** What the server recorded, as a plain event ("Asha edited it after it was approved."), else null. */
  event: string | null;
}

/**
 * One history entry in words. A person's note is a quote; the server's own
 * edit marker is a plain event, never presented as somebody's words.
 */
export function historyLine(entry: ApprovalHistoryItem, expense: ExpenseListItem): HistoryLine {
  const name = expensePersonName(entry.by, expense);
  const label = APPROVAL_HISTORY_LABEL[entry.action] ?? entry.action;
  const summary = [label, name, approvalDate(entry.at)].filter(Boolean).join(" · ");
  const system = systemNoteText(entry.note);
  return {
    summary,
    quote: entry.note && !system ? entry.note : null,
    event: system ? `${name || "The submitter"} ${system}.` : null,
  };
}
