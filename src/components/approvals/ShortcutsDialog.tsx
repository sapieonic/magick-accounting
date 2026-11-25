"use client";

import Modal, { ModalFooter } from "@/components/ui/Modal";
import Button from "@/components/ui/Button";

/** The review queue's shortcuts; every one is also a button on the page. */
export const REVIEW_SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["J", "↓"], label: "Next expense" },
  { keys: ["K", "↑"], label: "Previous expense" },
  { keys: ["A"], label: "Approve the open expense" },
  { keys: ["R"], label: "Reject the open expense (asks for a reason)" },
  { keys: ["X"], label: "Select or deselect it, for approving several at once" },
  { keys: ["Esc"], label: "Close the details" },
  { keys: ["?"], label: "Show this list" },
];

/** Lists the review queue's keyboard shortcuts. */
export default function ShortcutsDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Keyboard shortcuts">
      <div className="flex flex-col gap-4">
        <dl className="flex flex-col divide-y divide-rule-2 text-sm">
          {REVIEW_SHORTCUTS.map(({ keys, label }) => (
            <div key={label} className="flex items-center justify-between gap-4 py-2.5">
              <dt className="text-ink-2">{label}</dt>
              <dd className="flex shrink-0 items-center gap-1.5">
                {keys.map((key, index) => (
                  <span key={key} className="flex items-center gap-1.5">
                    {index > 0 && <span className="text-xs text-ink-3">or</span>}
                    <kbd className="num min-w-7 rounded border border-control-line bg-sunk px-1.5 py-0.5 text-center text-xs text-ink">
                      {key}
                    </kbd>
                  </span>
                ))}
              </dd>
            </div>
          ))}
        </dl>
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
