"use client";

import type { ReactNode } from "react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";

interface DialogActionsProps {
  onCancel: () => void;
  /** Label of the confirming button. */
  confirmLabel: ReactNode;
  /** Shows a spinner on the confirming button and disables both. */
  busy?: boolean;
  /** Replaces the confirm label while busy, e.g. "Removing...". */
  busyLabel?: ReactNode;
  variant?: "primary" | "danger";
  /** Without it the confirm button submits its form. */
  onConfirm?: () => void;
}

/** Right-aligned Cancel + confirm row at the foot of a dialog or form. */
export function DialogActions({
  onCancel,
  confirmLabel,
  busy = false,
  busyLabel,
  variant = "primary",
  onConfirm,
}: DialogActionsProps) {
  return (
    <div className="flex flex-wrap justify-end gap-2 pt-2">
      <Button variant="secondary" onClick={onCancel} disabled={busy}>
        Cancel
      </Button>
      <Button
        variant={variant}
        type={onConfirm ? "button" : "submit"}
        onClick={onConfirm}
        loading={busy}
      >
        {busy && busyLabel ? busyLabel : confirmLabel}
      </Button>
    </div>
  );
}

interface ConfirmDialogProps extends Omit<DialogActionsProps, "onCancel" | "variant" | "onConfirm"> {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  children: ReactNode;
}

/** Destructive confirmation: message + Cancel / danger button. */
export default function ConfirmDialog({ isOpen, onClose, onConfirm, title, children, ...actions }: ConfirmDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="flex flex-col gap-4">
        <div className="text-sm leading-relaxed text-ink-2">{children}</div>
        <DialogActions {...actions} variant="danger" onCancel={onClose} onConfirm={onConfirm} />
      </div>
    </Modal>
  );
}
