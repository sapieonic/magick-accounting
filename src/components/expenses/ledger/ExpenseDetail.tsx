"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeftRight,
  Building2,
  Calendar,
  Check,
  CircleCheck,
  CircleX,
  Clock3,
  Download,
  FileText,
  Image as ImageIcon,
  Luggage,
  Package,
  Paperclip,
  Pencil,
  Percent,
  Send,
  Tag,
  Trash2,
  Unlink,
  User,
  Wallet,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { APPROVAL_HISTORY_LABEL, effectiveApprovalStatus, type ReviewAction } from "@/lib/approval";
import { formatCurrency } from "@/lib/currency";
import { payerName } from "@/lib/expense-csv";
import { travelTypeLabel } from "@/lib/trip";
import { useToast } from "@/components/ui/Toast";
import Spinner from "@/components/ui/Spinner";
import Button, { IconButton } from "@/components/ui/Button";
import CategoryGlyph, { CategoryDot } from "@/components/ui/CategoryGlyph";
import { cn } from "@/components/ui/cn";
import { linkClass } from "@/components/ui/styles";
import DetailList, { type DetailItem } from "@/components/ui/DetailList";
import Notice from "@/components/ui/Notice";
import {
  historyParts,
  latestResubmission,
  relativeTime,
  reviewInfo,
  submittedAt,
} from "@/components/approvals/approval-format";
import PaymentMark from "@/components/expenses/ledger/PaymentMark";
import { conversionNote, expenseDate, isImageFile, paymentSourceDetail } from "@/components/expenses/ledger/format";
import type { ExpenseListItem } from "@/types/expense";

/**
 * The approval buttons of an expense's detail. `useApprovalActions().handlers`
 * builds one; pass it through rows and clusters unchanged.
 */
export interface ExpenseReviewActions {
  /** Admins: approve a pending expense (the caller owns undo). Omitted hides Approve. */
  onApprove?: (expense: ExpenseListItem) => void;
  /** Admins: ask for a reason, then reject. Omitted hides Reject…. */
  onReject?: (expense: ExpenseListItem) => void;
  /** Submitter: "Resubmit as is…" for their rejected expense. Omitted hides it. */
  onResubmit?: (expense: ExpenseListItem) => void;
  /** The signed-in user's id: submitter-only actions show on their own expenses. */
  viewerId?: string;
  /** Expenses whose approve/reject is in its undo window or being sent: their buttons are off. */
  inFlight?: Record<string, ReviewAction>;
  /** The review queue's keyboard shortcuts: A approves, R rejects (shown on the buttons). */
  shortcuts?: boolean;
}

export interface ExpenseActions {
  /** Deletes the expense (the caller owns undo); omitted hides Delete. */
  onDelete?: (expense: ExpenseListItem) => void;
  /** Takes the expense out of its trip; omitted hides the action. */
  onRemoveFromTrip?: (expense: ExpenseListItem) => void;
  /** Approve / reject / resubmit; omitted shows the approval state without actions. */
  review?: ExpenseReviewActions;
}

interface ExpenseDetailProps extends ExpenseActions {
  expense: ExpenseListItem;
  editHref: string;
  /** Side panel: glyph, title and the amount on top. Inline under a row, the row shows those. */
  showHeader?: boolean;
  /** The trip the expense is in (off inside that trip's own timeline). */
  showTrip?: boolean;
  /** Shows a close button in the header. */
  onClose?: () => void;
  id?: string;
  className?: string;
}

/** Fetches the presigned receipt URL (valid 1 hour) once the detail is shown. */
function useReceiptUrl(receiptKey?: string) {
  const { toast } = useToast();
  // A ref, so a new toast function identity never refetches.
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const [state, setState] = useState<{ key?: string; url: string | null; failed: boolean }>({ url: null, failed: false });

  useEffect(() => {
    if (!receiptKey) return;
    let active = true;
    setState({ key: receiptKey, url: null, failed: false });
    api
      .get(`/api/upload?key=${encodeURIComponent(receiptKey)}`)
      .then(({ downloadUrl }) => {
        if (active) setState({ key: receiptKey, url: downloadUrl, failed: false });
      })
      .catch(() => {
        if (!active) return;
        setState({ key: receiptKey, url: null, failed: true });
        toastRef.current("Failed to load receipt", "error");
      });
    return () => {
      active = false;
    };
  }, [receiptKey]);

  return state.key === receiptKey ? state : { url: null, failed: false };
}

/**
 * A document in the side panel. An image uses the full panel width at its own
 * aspect ratio (a fixed short frame would letterbox a portrait receipt down to
 * a thumbnail). A PDF fills a tall frame so its viewer scales to that width.
 * Inline details under a row keep the shorter frame.
 */
const PROMINENT_DOCUMENT = "h-[min(72dvh,840px)] w-full";

function Receipt({ expense, prominent = false }: { expense: ExpenseListItem; prominent?: boolean }) {
  const { url, failed } = useReceiptUrl(expense.receiptKey);
  const isImage = isImageFile(expense.receiptFilename);
  const FileIcon = isImage ? ImageIcon : FileText;
  const frame = prominent ? PROMINENT_DOCUMENT : "h-[min(500px,60dvh)] w-full";

  return (
    <section aria-label="Receipt" className="flex flex-col gap-2">
      <div className="flex items-center gap-3 rounded-control border border-dashed border-accent-line bg-tint p-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control border border-rule bg-surface text-accent">
          <FileIcon aria-hidden="true" size={18} strokeWidth={1.6} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="ell font-medium text-ink">{expense.receiptFilename || "Receipt"}</span>
          <span className="flex items-center gap-1 text-xs text-ink-3">
            <Paperclip aria-hidden="true" size={12} strokeWidth={1.75} />
            Receipt · link valid 1 hour
          </span>
        </div>
        {url && (
          <Button variant="ghost" size="sm" icon={Download} onClick={() => window.open(url, "_blank")}>
            Download
          </Button>
        )}
      </div>
      <div className={cn("overflow-hidden rounded-control border border-rule", prominent ? "bg-sunk" : "bg-surface")}>
        {url ? (
          isImage ? (
            <img
              src={url}
              alt={`Receipt for ${expense.title}`}
              className={prominent ? "h-auto w-full" : "max-h-[min(500px,60dvh)] w-full object-contain"}
            />
          ) : (
            <iframe src={url} title={`Receipt for ${expense.title}`} className={frame} />
          )
        ) : failed ? (
          <div className={cn("flex flex-col items-center justify-center gap-2 text-ink-3", prominent ? "min-h-48" : "py-10")}>
            <FileText aria-hidden="true" size={28} strokeWidth={1.5} />
            <p className="text-sm">Could not load receipt preview</p>
          </div>
        ) : (
          <div className={cn("flex items-center justify-center", prominent ? "min-h-48" : "py-14")}>
            <Spinner size="md" />
          </div>
        )}
      </div>
    </section>
  );
}

function PaidFrom({ expense }: { expense: ExpenseListItem }) {
  if (expense.paymentSource === "multiple" && expense.payments?.length) {
    return (
      <ul className="flex flex-col items-end gap-1">
        {expense.payments.map((entry, index) => (
          <li key={index} className="flex items-center gap-1.5">
            <PaymentMark
              expense={{ ...expense, paymentSource: entry.source === "company" ? "company" : "pocket" }}
            />
            <span>{payerName(entry)}</span>
            <span className="num">{formatCurrency(entry.amount, expense.currency?.code)}</span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      <PaymentMark expense={expense} decorative />
      <span>{paymentSourceDetail(expense)}</span>
    </span>
  );
}

/** A key hint inside a button; the button's aria-keyshortcuts announces it. */
function KeyHint({ children }: { children: string }) {
  return (
    <kbd
      aria-hidden="true"
      className="num ml-0.5 hidden rounded px-1 text-[11px] font-medium leading-4 opacity-70 ring-1 ring-inset ring-current lg:inline"
    >
      {children}
    </kbd>
  );
}

/**
 * Where the expense stands and what happens next, for an expense that isn't
 * approved: awaiting approval (with Approve / Reject… for admins) or rejected
 * (with the reason, and Edit & resubmit / Resubmit as is… for its submitter).
 */
function ApprovalNotice({ expense, editHref, review }: { expense: ExpenseListItem; editHref: string; review?: ExpenseReviewActions }) {
  const status = effectiveApprovalStatus(expense);
  const isReviewer = Boolean(review?.onApprove || review?.onReject);
  const isOwner = Boolean(review?.viewerId && review.viewerId === expense.createdBy?._id);
  const busy = Boolean(review?.inFlight?.[expense._id]);
  const submitter = expense.createdBy?.name || "the submitter";

  if (status === "pending") {
    const when = relativeTime(submittedAt(expense));
    const resubmission = isReviewer ? latestResubmission(expense) : null;
    return (
      <Notice
        icon={Clock3}
        title="Awaiting approval"
        actions={
          isReviewer && (
            <>
              {review?.onApprove && (
                <Button
                  icon={Check}
                  onClick={() => review.onApprove?.(expense)}
                  disabled={busy}
                  aria-keyshortcuts={review.shortcuts ? "A" : undefined}
                  className="grow basis-[120px] sm:grow-0"
                >
                  Approve
                  {review.shortcuts && <KeyHint>A</KeyHint>}
                </Button>
              )}
              {review?.onReject && (
                <Button
                  variant="danger"
                  icon={X}
                  onClick={() => review.onReject?.(expense)}
                  disabled={busy}
                  aria-keyshortcuts={review.shortcuts ? "R" : undefined}
                  className="grow basis-[120px] sm:grow-0"
                >
                  Reject…
                  {review.shortcuts && <KeyHint>R</KeyHint>}
                </Button>
              )}
            </>
          )
        }
      >
        {isReviewer ? (
          <p>
            Submitted by {expense.createdBy?.name || "a team member"}
            {when ? ` ${when}` : ""}. Not in totals yet.
          </p>
        ) : (
          <p>An admin will review this. It isn&apos;t included in company totals until it&apos;s approved.</p>
        )}
        {resubmission?.note && (
          <p className="mt-1.5">
            Note from {resubmission.name || submitter}:{" "}
            <q className="text-ink">{resubmission.note}</q>
          </p>
        )}
        {resubmission?.edited && (
          <p className="mt-1.5">
            {resubmission.name || "The submitter"} {resubmission.edited}.
          </p>
        )}
      </Notice>
    );
  }

  if (status === "rejected") {
    const { name, date } = reviewInfo(expense);
    const by = name || "An admin";
    return (
      <Notice
        tone="danger"
        icon={CircleX}
        title="Rejected"
        actions={
          isOwner && (
            <>
              <Button href={editHref} icon={Pencil} className="grow basis-[150px] sm:grow-0">
                Edit &amp; resubmit
              </Button>
              {review?.onResubmit && (
                <Button
                  variant="secondary"
                  icon={Send}
                  onClick={() => review.onResubmit?.(expense)}
                  className="grow basis-[150px] sm:grow-0"
                >
                  Resubmit as is…
                </Button>
              )}
            </>
          )
        }
      >
        <p>
          {by} rejected this{date ? ` on ${date}` : ""}.
        </p>
        {expense.rejectionReason && (
          <blockquote className="my-2 whitespace-pre-line border-l-2 border-danger/40 pl-3 text-ink">
            {expense.rejectionReason}
          </blockquote>
        )}
        <p>
          {isOwner || !review
            ? "What next: fix the details and resubmit, or delete it if it was a mistake."
            : `What next: ${submitter} can fix it and resubmit. It isn't in company totals.`}
        </p>
      </Notice>
    );
  }

  return null;
}

/** "Approved by Priya on 12 Nov", "Added by an admin, approved automatically", or (legacy) "Approved". */
function approvedText(expense: ExpenseListItem): string {
  const history = expense.approvalHistory ?? [];
  const last = history[history.length - 1];
  if (last?.action === "auto_approved") return APPROVAL_HISTORY_LABEL.auto_approved;
  const { name, date } = reviewInfo(expense);
  if (name && date) return `Approved by ${name} on ${date}`;
  if (name) return `Approved by ${name}`;
  return "Approved";
}

/** Every submit, review and resubmit, oldest first, folded away. */
function ApprovalHistory({ expense }: { expense: ExpenseListItem }) {
  const history = expense.approvalHistory ?? [];
  return (
    <details className="group flex flex-col gap-2 text-sm">
      <summary className="cap inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-control text-ink-3 hover:text-ink">
        Approval history ({history.length})
      </summary>
      <ol className="flex flex-col divide-y divide-rule-2 border-y border-rule-2">
        {history.map((entry, index) => {
          const { name, date } = historyParts(entry, expense);
          return (
            <li key={index} className="flex flex-col gap-0.5 py-2">
              <span className="text-ink">
                {[APPROVAL_HISTORY_LABEL[entry.action] ?? entry.action, name, date].filter(Boolean).join(" · ")}
              </span>
              {entry.note && <span className="whitespace-pre-line text-ink-3">&ldquo;{entry.note}&rdquo;</span>}
            </li>
          );
        })}
      </ol>
    </details>
  );
}

/**
 * Everything about one expense: its fields, payers, receipt and actions.
 * Shown in the side panel on wide screens and under its row otherwise.
 */
export default function ExpenseDetail({
  expense,
  editHref,
  onDelete,
  onRemoveFromTrip,
  review,
  showHeader = false,
  showTrip = true,
  onClose,
  id,
  className,
}: ExpenseDetailProps) {
  const code = expense.currency?.code;
  const conversion = conversionNote(expense);
  const assets = expense.linkedAssetCount || 0;
  const trip = showTrip ? expense.trip : null;

  const status = effectiveApprovalStatus(expense);
  const ownerCanResubmit = status === "rejected" && Boolean(review?.viewerId && review.viewerId === expense.createdBy?._id);
  const historyCount = expense.approvalHistory?.length ?? 0;

  const items: DetailItem[] = [
    ...(status === "approved" ? [{ label: "Approval", icon: CircleCheck, value: approvedText(expense) }] : []),
    ...(!showHeader && conversion ? [{ label: "Converted", icon: ArrowLeftRight, value: <span className="num text-xs">{conversion}</span> }] : []),
    ...(expense.gstAmount != null && expense.gstAmount > 0
      ? [{ label: "GST (incl.)", icon: Percent, value: <span className="num">{formatCurrency(expense.gstAmount, code)}</span> }]
      : []),
    { label: "Date", icon: Calendar, value: expenseDate(expense, "EEE, d MMM yyyy") },
    {
      label: "Category",
      icon: Tag,
      value: (
        <span className="inline-flex items-center gap-2">
          <CategoryDot name={expense.category?.name} />
          {expense.category?.name}
        </span>
      ),
    },
    { label: "Department", icon: Building2, value: expense.department?.name },
    { label: "Submitted by", icon: User, value: expense.createdBy?.name },
    { label: "Paid from", icon: Wallet, value: <PaidFrom expense={expense} /> },
    ...(trip
      ? [
          {
            label: "Trip",
            icon: Luggage,
            value: (
              <Link href={`/dashboard/trips/${trip._id}`} className={cn(linkClass, "inline-flex max-w-full items-center gap-1.5")}>
                <span className="ell">{trip.name}</span>
                {expense.travelType && <span className="shrink-0 font-normal text-ink-3">· {travelTypeLabel(expense.travelType)}</span>}
              </Link>
            ),
          },
        ]
      : []),
    ...(assets > 0
      ? [
          {
            label: "Assets",
            icon: Package,
            value: (
              <Link href="/dashboard/assets" className={linkClass}>
                {assets} linked asset{assets !== 1 ? "s" : ""}
              </Link>
            ),
          },
        ]
      : []),
  ];

  return (
    <div id={id} className={cn("flex flex-col gap-5", className)}>
      {showHeader && (
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <CategoryGlyph name={expense.category?.name} size="xl" />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="cap text-ink-3">Selected</span>
              <h2 className="text-lg font-semibold tracking-[-0.015em] text-ink [text-wrap:pretty]">{expense.title}</h2>
            </div>
            {onClose && <IconButton icon={X} size="sm" onClick={onClose} aria-label="Close details" />}
          </div>
          <div className="flex flex-col gap-0.5 [container-type:inline-size]">
            <span className="num whitespace-nowrap text-[clamp(22px,11cqi,30px)] font-medium tracking-[-0.035em] text-ink">
              {formatCurrency(expense.amount, code)}
            </span>
            <span className="text-[13px] text-ink-3">{conversion ?? "Base currency, no conversion"}</span>
          </div>
        </div>
      )}

      <ApprovalNotice expense={expense} editHref={editHref} review={review} />

      {showHeader && expense.receiptKey && <Receipt expense={expense} prominent />}

      <DetailList items={items} />

      {expense.description && (
        <div className="flex flex-col gap-1">
          <span className="cap text-ink-3">Description</span>
          <p className="whitespace-pre-line text-sm text-ink-2">{expense.description}</p>
        </div>
      )}

      {!showHeader && expense.receiptKey && <Receipt expense={expense} />}

      {historyCount > 1 && <ApprovalHistory expense={expense} />}

      <div className="flex flex-wrap gap-2 border-t border-rule-2 pt-4">
        {/* The rejected notice already offers "Edit & resubmit" to its submitter. */}
        {!ownerCanResubmit && (
          <Button href={editHref} icon={Pencil} className="grow basis-[100px]">
            Edit
          </Button>
        )}
        {onRemoveFromTrip && (
          <Button variant="secondary" icon={Unlink} onClick={() => onRemoveFromTrip(expense)} className="grow basis-[150px] !text-amber">
            Remove from trip
          </Button>
        )}
        {onDelete && (
          <Button variant="danger" icon={Trash2} onClick={() => onDelete(expense)} className="grow basis-[100px]">
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}
