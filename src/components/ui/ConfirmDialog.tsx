"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import Button from "@/components/ui/Button";
import Modal, { ModalFooter } from "@/components/ui/Modal";

interface DialogActionsProps {
  onCancel: () => void;
  /** Label of the confirming button. */
  confirmLabel: ReactNode;
  /** Shows a spinner on the confirming button and disables both. */
  busy?: boolean;
  /** Replaces the confirm label while busy, e.g. "Removing...". */
  busyLabel?: ReactNode;
  variant?: "primary" | "danger";
  /** Leading icon of the confirming button. */
  icon?: LucideIcon;
  /** Without it the confirm button submits its form. */
  onConfirm?: () => void;
  /** Disables the confirming button, e.g. while nothing is selected. */
  disabled?: boolean;
  /** Shown before the buttons, e.g. a selection summary. */
  children?: ReactNode;
}

/** Cancel + confirm in the sticky ModalFooter at the foot of a dialog or its form. */
export function DialogActions({
  onCancel,
  confirmLabel,
  busy = false,
  busyLabel,
  variant = "primary",
  icon,
  onConfirm,
  disabled,
  children,
}: DialogActionsProps) {
  return (
    <ModalFooter>
      {children}
      <Button variant="secondary" onClick={onCancel} disabled={busy}>
        Cancel
      </Button>
      <Button
        variant={variant}
        icon={icon}
        type={onConfirm ? "button" : "submit"}
        onClick={onConfirm}
        disabled={disabled}
        loading={busy}
      >
        {busy && busyLabel ? busyLabel : confirmLabel}
      </Button>
    </ModalFooter>
  );
}

interface ConfirmDialogProps extends Omit<DialogActionsProps, "onCancel" | "variant" | "onConfirm" | "children" | "disabled"> {
  isOpen: boolean;
  /** Also the Cancel action; ignored while `busy`. */
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  children: ReactNode;
}

/** Destructive confirmation: message + Cancel / danger button. */
export default function ConfirmDialog({ isOpen, onClose, onConfirm, title, children, ...actions }: ConfirmDialogProps) {
  const close = () => {
    if (!actions.busy) onClose();
  };
  return (
    <Modal isOpen={isOpen} onClose={close} title={title}>
      <div className="flex flex-col gap-4">
        <div className="text-sm leading-relaxed text-ink-2">{children}</div>
        <DialogActions {...actions} variant="danger" onCancel={close} onConfirm={onConfirm} />
      </div>
    </Modal>
  );
}
