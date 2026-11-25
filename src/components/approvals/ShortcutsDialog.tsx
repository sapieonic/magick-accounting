"use client";

import { useId } from "react";
import Modal, { ModalFooter } from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import { peerFocusRing } from "@/components/ui/styles";

interface ReviewShortcut {
  keys: string[];
  label: string;
}

/**
 * The review queue's shortcuts; every one is also a button on the page.
 * Single-character keys can be switched off (WCAG 2.1.4), the arrows and Esc
 * always work.
 */
export const REVIEW_SHORTCUTS: { single: ReviewShortcut[]; always: ReviewShortcut[] } = {
  always: [
    { keys: ["↓"], label: "Next expense" },
    { keys: ["↑"], label: "Previous expense" },
    { keys: ["Esc"], label: "Close the details" },
  ],
  single: [
    { keys: ["J"], label: "Next expense" },
    { keys: ["K"], label: "Previous expense" },
    { keys: ["A"], label: "Approve the open expense" },
    { keys: ["R"], label: "Reject the open expense (asks for a reason)" },
    { keys: ["X"], label: "Select or deselect it, for approving several at once" },
    { keys: ["?"], label: "Show this list" },
  ],
};

/** The localStorage key for the per-viewer on/off switch. */
export const SINGLE_KEY_SHORTCUTS_KEY = "approvals.singleKeyShortcuts";

interface ShortcutsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Single-key shortcuts (J, K, A, R, X, ?) are on. */
  singleKeys: boolean;
  onSingleKeysChange: (on: boolean) => void;
}

function ShortcutList({ items, muted = false }: { items: ReviewShortcut[]; muted?: boolean }) {
  return (
    <dl className="flex flex-col divide-y divide-rule-2 text-sm">
      {items.map(({ keys, label }) => (
        <div key={`${label}-${keys.join()}`} className="flex items-center justify-between gap-4 py-2.5">
          <dt className={muted ? "text-ink-3" : "text-ink-2"}>{label}</dt>
          <dd className="flex shrink-0 items-center gap-1.5">
            {keys.map((key) => (
              <kbd
                key={key}
                className="num min-w-7 rounded border border-control-line bg-sunk px-1.5 py-0.5 text-center text-xs text-ink"
              >
                {key}
              </kbd>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Lists the review queue's keyboard shortcuts, with the switch for single-key ones. */
export default function ShortcutsDialog({ isOpen, onClose, singleKeys, onSingleKeysChange }: ShortcutsDialogProps) {
  const hintId = useId();
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Keyboard shortcuts">
      <div className="flex flex-col gap-4">
        <ShortcutList items={REVIEW_SHORTCUTS.always} />
        <div className="flex flex-col gap-1 border-t border-rule pt-3">
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium text-ink">
            <input
              type="checkbox"
              className="peer sr-only"
              checked={singleKeys}
              onChange={(e) => onSingleKeysChange(e.target.checked)}
              aria-describedby={hintId}
            />
            <Checkbox checked={singleKeys} className={peerFocusRing} />
            Single-key shortcuts
          </label>
          <p id={hintId} className="text-[13px] text-ink-3">
            {singleKeys
              ? "On. Turn them off if you use speech input or press keys by accident. This browser remembers your choice."
              : "Off: letters don't do anything here. The arrows and Esc still work, and every action is also a button."}
          </p>
        </div>
        {singleKeys && <ShortcutList items={REVIEW_SHORTCUTS.single} />}
        <p className="text-[13px] text-ink-3">Shortcuts pause while you type in a field or a dialog is open.</p>
        <ModalFooter>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </ModalFooter>
      </div>
    </Modal>
  );
}
