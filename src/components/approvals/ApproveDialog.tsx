"use client";

import { Check } from "lucide-react";
import { formatBaseCurrency } from "@/lib/currency";
import Modal from "@/components/ui/Modal";
import { DialogActions } from "@/components/ui/ConfirmDialog";
import { baseAmount } from "@/components/expenses/ledger/format";
import type { ExpenseListItem } from "@/types/expense";

interface ApproveDialogProps {
  isOpen: boolean;
  expenses: ExpenseListItem[];
  onClose: () => void;
  onConfirm: () => void;
}

/** Confirms a bulk approve (a single approve needs no dialog: it can be undone). */
export default function ApproveDialog({ isOpen, expenses, onClose, onConfirm }: ApproveDialogProps) {
  const count = expenses.length;
  const total = formatBaseCurrency(expenses.reduce((sum, e) => sum + baseAmount(e), 0));
  const noun = `${count} expense${count !== 1 ? "s" : ""}`;
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Approve ${noun}`}>
      <div className="flex flex-col gap-4">
        <p className="text-sm leading-relaxed text-ink-2">
          Approve {noun} totalling <span className="num font-medium text-ink">{total}</span>?{" "}
          {count === 1 ? "It'll count" : "They'll count"} in company totals. You can undo for a few seconds afterwards.
        </p>
        <DialogActions onCancel={onClose} onConfirm={onConfirm} confirmLabel={`Approve ${noun}`} icon={Check} />
      </div>
    </Modal>
  );
}
