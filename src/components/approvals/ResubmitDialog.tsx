"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Send } from "lucide-react";
import { APPROVAL_NOTE_MAX } from "@/lib/approval";
import Modal from "@/components/ui/Modal";
import { DialogActions } from "@/components/ui/ConfirmDialog";
import Field, { textareaClass } from "@/components/ui/Field";
import type { ExpenseListItem } from "@/types/expense";

interface ResubmitDialogProps {
  isOpen: boolean;
  expense: ExpenseListItem | null;
  onClose: () => void;
  /** Sends it back for approval with the optional note; resolves once settled. */
  onConfirm: (note: string | null) => Promise<unknown> | void;
  busy?: boolean;
}

/** "Resubmit as is": the rejected expense goes back to an admin unchanged, with an optional note. */
export default function ResubmitDialog({ isOpen, expense, onClose, onConfirm, busy = false }: ResubmitDialogProps) {
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

  return (
    <Modal isOpen={isOpen} onClose={close} title="Resubmit for approval">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-sm leading-relaxed text-ink-2">
          {expense ? <span className="font-medium text-ink">&ldquo;{expense.title}&rdquo;</span> : "This expense"} goes back
          to an admin without changes. If something was wrong, use Edit &amp; resubmit instead.
        </p>
        <Field
          label="Note for the reviewer"
          optional
          hint={`${note.trim().length} / ${APPROVAL_NOTE_MAX} characters`}
        >
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={APPROVAL_NOTE_MAX}
            rows={3}
            placeholder="Add a note for the reviewer, e.g. why this is a business expense"
            className={textareaClass}
          />
        </Field>
        <DialogActions onCancel={close} confirmLabel="Resubmit" busyLabel="Resubmitting..." busy={busy} icon={Send} />
      </form>
    </Modal>
  );
}
