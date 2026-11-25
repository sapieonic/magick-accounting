"use client";

import { useEffect, useState, type FormEvent } from "react";
import { RotateCcw } from "lucide-react";
import { APPROVAL_NOTE_MAX, effectiveApprovalStatus } from "@/lib/approval";
import Modal from "@/components/ui/Modal";
import { DialogActions } from "@/components/ui/ConfirmDialog";
import Field, { textareaClass } from "@/components/ui/Field";
import type { ExpenseListItem } from "@/types/expense";

interface ReopenDialogProps {
  isOpen: boolean;
  expense: ExpenseListItem | null;
  onClose: () => void;
  /** Moves it back to review with the optional note; resolves once settled. */
  onConfirm: (note: string | null) => Promise<unknown> | void;
  busy?: boolean;
}

/**
 * "Move back to review": an admin takes back an approval or a rejection, so
 * the expense waits in the queue again. Confirmed here (no undo window).
 */
export default function ReopenDialog({ isOpen, expense, onClose, onConfirm, busy = false }: ReopenDialogProps) {
  const [note, setNote] = useState("");

  useEffect(() => {
    if (isOpen) setNote("");
  }, [isOpen]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const trimmed = note.trim();
    void onConfirm(trimmed ? trimmed : null);
  };

  const close = () => {
    if (!busy) onClose();
  };

  const rejected = expense ? effectiveApprovalStatus(expense) === "rejected" : false;
  const name = expense ? <span className="font-medium text-ink">&ldquo;{expense.title}&rdquo;</span> : "This expense";

  return (
    <Modal isOpen={isOpen} onClose={close} title="Move back to review">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-sm leading-relaxed text-ink-2">
          {name} goes back to the approval queue as awaiting approval.{" "}
          {rejected
            ? "Its rejection is withdrawn, so it can be approved without being resubmitted. It stays out of totals until it's approved."
            : "It will stop counting in totals until it's approved again."}
        </p>
        <Field label="Note for the approval history" optional hint={`${note.trim().length} / ${APPROVAL_NOTE_MAX} characters`}>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={APPROVAL_NOTE_MAX}
            rows={3}
            placeholder="Why it needs another look, e.g. approved by mistake"
            className={textareaClass}
          />
        </Field>
        <DialogActions
          onCancel={close}
          confirmLabel="Move back to review"
          busyLabel="Moving..."
          busy={busy}
          icon={RotateCcw}
        />
      </form>
    </Modal>
  );
}
