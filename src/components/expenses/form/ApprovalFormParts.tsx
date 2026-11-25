import Link from "next/link";
import { format } from "date-fns";
import { CircleCheck, CircleX, Clock3 } from "lucide-react";
import Notice from "@/components/ui/Notice";
import FormSection from "@/components/ui/FormSection";
import { inlineLinkClass } from "@/components/ui/styles";
import { APPROVAL_HISTORY_LABEL, type ApprovalStatus } from "@/lib/approval";
import type { ApprovalHistoryItem } from "@/types/expense";

type PersonRef = { _id: string; name?: string; email?: string } | string | null | undefined;

/** A populated person's name; ids alone (unpopulated) give `fallback`. */
export function personName(person: PersonRef, fallback = "Someone"): string {
  if (person && typeof person === "object") return person.name || person.email || fallback;
  return fallback;
}

/** "12 Nov 2026"; `null` for a missing or invalid date. */
export function approvalDate(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : format(date, "d MMM yyyy");
}

/** The approval facts the edit form shows, read off `GET /api/expenses/[id]`. */
export interface EditApprovalState {
  status: ApprovalStatus;
  reviewer: string | null;
  reviewedAt: string | null;
  reason: string | null;
  history: ApprovalHistoryItem[];
  submitterName: string;
}

interface EditApprovalNoticeProps {
  approval: EditApprovalState;
  /** The signed-in person can review (admin), as opposed to the submitter editing their own. */
  isReviewer: boolean;
  /** The accounting fields are locked (linked assets), so editing can't send it back for approval. */
  accountingLocked?: boolean;
}

/**
 * What the expense's approval state means for this edit: why it was rejected
 * and what to do, what sends an approved one back for approval, or that a
 * pending one is still waiting. Nothing for an admin's approved expense.
 */
export function EditApprovalNotice({ approval, isReviewer, accountingLocked = false }: EditApprovalNoticeProps) {
  const { status } = approval;
  if (status === "rejected") {
    const date = approvalDate(approval.reviewedAt);
    const by = approval.reviewer ? `Rejected by ${approval.reviewer}` : "Rejected";
    return (
      <Notice tone="danger" icon={CircleX} title={date ? `${by} · ${date}` : by}>
        <div className="flex flex-col gap-2">
          {approval.reason && (
            <blockquote className="border-l-2 border-danger/40 pl-3 text-ink [overflow-wrap:anywhere]">
              <span className="sr-only">Reason: </span>
              {approval.reason}
            </blockquote>
          )}
          <p>
            {isReviewer
              ? `Saving changes doesn't change its status. ${approval.submitterName} can fix and resubmit it.`
              : "What next: fix the details below and resubmit it, or delete it if it was a mistake."}
          </p>
        </div>
      </Notice>
    );
  }
  if (status === "pending") {
    return (
      <Notice
        icon={Clock3}
        title="Awaiting approval"
        actions={
          isReviewer ? (
            <Link href="/dashboard/approvals" className={inlineLinkClass}>
              Review it in Approvals
            </Link>
          ) : undefined
        }
      >
        {isReviewer
          ? "Saving changes doesn't approve it. It isn't included in company totals until it's approved."
          : "An admin hasn't reviewed this expense yet. Your changes will be reviewed along with it."}
      </Notice>
    );
  }
  if (isReviewer || accountingLocked) return null;
  return (
    <Notice icon={CircleCheck} title="This expense is approved">
      Changing the amount, date, category, department, payment or receipt sends it back for approval. Title,
      description and trip changes don&apos;t.
    </Notice>
  );
}

/** Read-only audit trail: "Submitted · Asha · 10 Nov 2026", "Rejected · Priya · 12 Nov 2026 · “Receipt missing”". */
export function ApprovalHistorySection({ history }: { history: ApprovalHistoryItem[] }) {
  if (history.length === 0) return null;
  return (
    <FormSection title="Approval history" description="Who submitted and reviewed this expense, oldest first.">
      <ol className="flex flex-col gap-2 text-[13px]">
        {history.map((entry, index) => {
          const date = approvalDate(entry.at);
          return (
            <li key={`${entry.action}-${String(entry.at)}-${index}`} className="flex flex-col gap-0.5">
              <span className="text-ink">
                <span className="font-medium">{APPROVAL_HISTORY_LABEL[entry.action] ?? entry.action}</span>
                <span className="text-ink-3">
                  {" · "}
                  {personName(entry.by)}
                  {date && (
                    <>
                      {" · "}
                      <time dateTime={new Date(entry.at).toISOString()} className="num">
                        {date}
                      </time>
                    </>
                  )}
                </span>
              </span>
              {entry.note && <span className="text-ink-2 [overflow-wrap:anywhere]">“{entry.note}”</span>}
            </li>
          );
        })}
      </ol>
    </FormSection>
  );
}
