"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { REJECTION_REASON_MAX, REJECTION_REASON_MIN } from "@/lib/approval";
import { formatBaseCurrency, formatCurrency } from "@/lib/currency";
import Modal from "@/components/ui/Modal";
import { DialogActions } from "@/components/ui/ConfirmDialog";
import Field, { textareaClass } from "@/components/ui/Field";
import { Chip } from "@/components/ui/Badge";
import { baseAmount } from "@/components/expenses/ledger/format";
import type { ExpenseListItem } from "@/types/expense";

/** One-tap reasons; each toggles its phrase in the reason, which stays editable. */
export const QUICK_REASONS = [
  "Receipt missing or unreadable",
  "Not a business expense",
  "Wrong amount or currency",
  "Duplicate",
  "Wrong category or department",
] as const;

const SEPARATOR = ". ";

/** Adds `phrase` to the reason, or takes it out again. */
export function toggleReason(reason: string, phrase: string): string {
  if (reason.includes(phrase)) {
    return reason
      .replace(phrase, "")
      .replace(/^[\s.]+/, "")
      .replace(/\s*\.\s*\.\s*/g, SEPARATOR)
      .replace(/[\s.]+$/, "")
      .trim();
  }
  const base = reason.trim().replace(/\.$/, "");
  return base ? `${base}${SEPARATOR}${phrase}` : phrase;
}

export const REJECT_REASON_ERROR = "Add a reason so the submitter knows what to fix.";

interface RejectDialogProps {
  isOpen: boolean;
  /** The expenses being rejected; one shared reason covers them all. */
  expenses: ExpenseListItem[];
  onClose: () => void;
  /** Called with the trimmed reason (3–500 characters). */
  onConfirm: (reason: string) => void;
}

/**
 * Asks why before rejecting. The reason is required, because it is the only
 * thing that tells the submitter what to fix; quick reasons fill it in.
 */
export default function RejectDialog({ isOpen, expenses, onClose, onConfirm }: RejectDialogProps) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const count = expenses.length;
  const single = count === 1 ? expenses[0] : null;
  const submitters = [...new Set(expenses.map((e) => e.createdBy?.name).filter(Boolean))];

  // A fresh reason each time it opens.
  useEffect(() => {
    if (isOpen) {
      setReason("");
      setError(null);
    }
  }, [isOpen]);

  const trimmed = reason.trim();
  const tooLong = trimmed.length > REJECTION_REASON_MAX;

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (trimmed.length < REJECTION_REASON_MIN) {
      setError(REJECT_REASON_ERROR);
      textareaRef.current?.focus();
      return;
    }
    if (tooLong) {
      setError(`Keep the reason under ${REJECTION_REASON_MAX} characters.`);
      textareaRef.current?.focus();
      return;
    }
    onConfirm(trimmed);
  };

  const pick = (phrase: string) => {
    setReason((prev) => toggleReason(prev, phrase));
    setError(null);
    textareaRef.current?.focus();
  };

  const title = single ? "Reject expense" : `Reject ${count} expenses`;
  const total = expenses.reduce((sum, e) => sum + baseAmount(e), 0);
  const who = submitters.length === 1 ? submitters[0] : "The submitters";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1 text-sm text-ink-2">
          {single ? (
            <p>
              <span className="font-medium text-ink">&ldquo;{single.title}&rdquo;</span>
              {" · "}
              <span className="num">{formatCurrency(single.amount, single.currency?.code)}</span>
              {single.createdBy?.name ? ` · ${single.createdBy.name}` : ""}
            </p>
          ) : (
            <p>
              <span className="font-medium text-ink">{count} expenses</span>
              {" · "}
              <span className="num">{formatBaseCurrency(total)}</span>
            </p>
          )}
          <p>
            {who} will see your reason and can fix the expense and send it again. It won&apos;t count in company totals.
          </p>
        </div>

        <div role="group" aria-label="Quick reasons" className="flex flex-wrap gap-2">
          {QUICK_REASONS.map((phrase) => (
            <Chip key={phrase} pressed={reason.includes(phrase)} onClick={() => pick(phrase)}>
              {phrase}
            </Chip>
          ))}
        </div>

        <Field
          label={`Reason — ${submitters.length === 1 ? "the submitter" : "the submitters"} will see this`}
          error={error}
          hint={`${trimmed.length} / ${REJECTION_REASON_MAX} characters · at least ${REJECTION_REASON_MIN}`}
        >
          <textarea
            ref={textareaRef}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (error) setError(null);
            }}
            maxLength={REJECTION_REASON_MAX}
            required
            rows={3}
            placeholder="What should they fix?"
            className={textareaClass}
          />
        </Field>

        <DialogActions
          onCancel={onClose}
          confirmLabel={single ? "Reject expense" : `Reject ${count} expenses`}
          variant="danger"
          icon={X}
        />
      </form>
    </Modal>
  );
}
