import { format, formatDistanceStrict } from "date-fns";
import { effectiveApprovalStatus, type ApprovalStatus } from "@/lib/approval";
import type { ApprovalHistoryItem, ExpenseListItem } from "@/types/expense";

/**
 * Plain-language pieces of an expense's approval state, shared by the rows,
 * the detail and the review queue. Client-safe.
 */

type Person = { _id: string; name: string; email?: string } | string | null | undefined;

const idOf = (person: Person): string | null =>
  person == null ? null : typeof person === "string" ? person : person._id;

/**
 * A person's name from a populated ref, or from the expense's own submitter /
 * reviewer when the ref is a bare id (list rows don't populate the history).
 */
export function personName(person: Person, expense: ExpenseListItem): string | null {
  if (person && typeof person === "object" && person.name) return person.name;
  const id = idOf(person);
  if (!id) return null;
  if (expense.createdBy?._id === id) return expense.createdBy.name;
  if (expense.reviewedBy && typeof expense.reviewedBy === "object" && expense.reviewedBy._id === id) {
    return expense.reviewedBy.name;
  }
  return null;
}

/** "6 days ago", "less than a minute ago" → "just now". */
export function relativeTime(iso: string | null | undefined, now: Date = new Date()): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  if (Math.abs(now.getTime() - date.getTime()) < 60_000) return "just now";
  return `${formatDistanceStrict(date, now)} ago`;
}

/** "12 Nov" this year, else "12 Nov 2025". */
export function shortDate(iso: string | null | undefined, now: Date = new Date()): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return format(date, date.getFullYear() === now.getFullYear() ? "d MMM" : "d MMM yyyy");
}

/** When the expense last went to an admin: the latest (re)submission, else its creation. */
export function submittedAt(expense: ExpenseListItem): string | null {
  const history = expense.approvalHistory ?? [];
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].action === "submitted" || history[i].action === "resubmitted") return history[i].at;
  }
  return expense.createdAt ?? null;
}

/** Notes the server writes itself when an edit sends an expense back for approval. */
const EDIT_NOTES: Record<string, string> = {
  "Edited after approval": "changed it after it was approved",
  "Edited after rejection": "edited it after it was rejected",
};

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
  const edited = last.note ? EDIT_NOTES[last.note] ?? null : null;
  const note = last.note && !edited ? last.note : null;
  if (!note && !edited) return null;
  return { name: personName(last.by, expense), note, edited };
}

/** The reviewer's name and the review date of an approved or rejected expense. */
export function reviewInfo(expense: ExpenseListItem): { name: string | null; date: string | null } {
  return { name: personName(expense.reviewedBy, expense), date: shortDate(expense.reviewedAt) };
}

/** "Already approved", for a review another admin made first. */
export function alreadyReviewedLabel(status: ApprovalStatus | null | undefined): string {
  return status === "rejected" ? "rejected" : status === "approved" ? "approved" : "reviewed";
}

/** One history entry as words: "Rejected · Priya · 12 Nov". */
export function historyParts(entry: ApprovalHistoryItem, expense: ExpenseListItem) {
  return { name: personName(entry.by, expense), date: shortDate(entry.at) };
}
