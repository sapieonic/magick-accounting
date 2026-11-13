"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeftRight,
  Building2,
  Calendar,
  Download,
  FileText,
  Image as ImageIcon,
  Luggage,
  Package,
  Paperclip,
  Pencil,
  Percent,
  Tag,
  Trash2,
  Unlink,
  User,
  Wallet,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/currency";
import { payerName } from "@/lib/expense-csv";
import { travelTypeLabel } from "@/lib/trip";
import { useToast } from "@/components/ui/Toast";
import Spinner from "@/components/ui/Spinner";
import Button, { IconButton } from "@/components/ui/Button";
import { Dot } from "@/components/ui/Badge";
import CategoryGlyph, { CategoryDot } from "@/components/ui/CategoryGlyph";
import { cn } from "@/components/ui/cn";
import { linkClass } from "@/components/ui/styles";
import DetailList, { type DetailItem } from "@/components/expenses/ledger/DetailList";
import PaymentDot from "@/components/expenses/ledger/PaymentDot";
import { conversionNote, expenseDate, isImageFile, paymentSourceDetail } from "@/components/expenses/ledger/format";
import type { ExpenseListItem } from "@/types/expense";

export interface ExpenseActions {
  /** Deletes the expense (the caller owns undo); omitted hides Delete. */
  onDelete?: (expense: ExpenseListItem) => void;
  /** Takes the expense out of its trip; omitted hides the action. */
  onRemoveFromTrip?: (expense: ExpenseListItem) => void;
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

function Receipt({ expense }: { expense: ExpenseListItem }) {
  const { url, failed } = useReceiptUrl(expense.receiptKey);
  const isImage = isImageFile(expense.receiptFilename);
  const FileIcon = isImage ? ImageIcon : FileText;

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
      <div className="overflow-hidden rounded-control border border-rule bg-surface">
        {url ? (
          isImage ? (
            <img src={url} alt={`Receipt for ${expense.title}`} className="max-h-[min(500px,60dvh)] w-full object-contain" />
          ) : (
            <iframe src={url} title={`Receipt for ${expense.title}`} className="h-[min(500px,60dvh)] w-full" />
          )
        ) : failed ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-ink-3">
            <FileText aria-hidden="true" size={28} strokeWidth={1.5} />
            <p className="text-sm">Could not load receipt preview</p>
          </div>
        ) : (
          <div className="flex items-center justify-center py-14">
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
          <li key={index} className="flex items-center gap-2">
            <Dot tone={entry.source === "company" ? "accent" : "amber"} />
            <span>{payerName(entry)}</span>
            <span className="num">{formatCurrency(entry.amount, expense.currency?.code)}</span>
            <span className="text-xs text-ink-3">{entry.source === "company" ? "company" : "pocket"}</span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      <PaymentDot expense={expense} />
      <span>{paymentSourceDetail(expense)}</span>
    </span>
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

  const items: DetailItem[] = [
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

      <DetailList items={items} />

      {expense.description && (
        <div className="flex flex-col gap-1">
          <span className="cap text-ink-3">Description</span>
          <p className="whitespace-pre-line text-sm text-ink-2">{expense.description}</p>
        </div>
      )}

      {expense.receiptKey && <Receipt expense={expense} />}

      <div className="flex flex-wrap gap-2 border-t border-rule-2 pt-4">
        <Button href={editHref} icon={Pencil} className="grow basis-[100px]">
          Edit
        </Button>
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
