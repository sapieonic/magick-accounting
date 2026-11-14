"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import Modal from "@/components/ui/Modal";
import ReceiptDropzone from "@/components/ui/ReceiptDropzone";
import Spinner from "@/components/ui/Spinner";
import { peerFocusRing } from "@/components/ui/styles";

const SKIP_UPLOAD_MODAL_KEY = "expense-upload-modal-skip";

/** False once the user ticked "Don't show this automatically again". */
export function shouldOfferUploadModal(): boolean {
  try {
    return localStorage.getItem(SKIP_UPLOAD_MODAL_KEY) !== "true";
  } catch {
    return true;
  }
}

interface ReceiptUploadModalProps {
  isOpen: boolean;
  extracting: boolean;
  onFile: (file: File) => void;
  onClose: () => void;
}

/** The "upload a receipt and we'll fill the form" prompt shown on arrival. */
export default function ReceiptUploadModal({ isOpen, extracting, onFile, onClose }: ReceiptUploadModalProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const skip = () => {
    if (dontShowAgain) {
      try {
        localStorage.setItem(SKIP_UPLOAD_MODAL_KEY, "true");
      } catch {
        // Storage blocked: the prompt simply shows again next time.
      }
    }
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={() => !extracting && onClose()} title="Upload a receipt">
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3 rounded-control bg-accent-soft px-4 py-3">
          <Sparkles aria-hidden="true" size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-accent" />
          <p className="text-sm text-ink-2 [text-wrap:pretty]">
            Just upload your receipt — we&apos;ll read it with AI and fill in the title, amount, category, date and
            more for you. You can review and edit everything before creating the expense.
          </p>
        </div>

        {extracting ? (
          <div className="flex flex-col items-center gap-2 rounded-panel border-[1.5px] border-dashed border-accent-line bg-tint px-4 py-10 text-center">
            <Spinner size="md" />
            <span className="text-sm font-medium text-ink">Reading your receipt…</span>
            <span className="text-xs text-ink-3">This usually takes a few seconds</span>
          </div>
        ) : (
          <ReceiptDropzone onFile={onFile} className="py-10" />
        )}

        {!extracting && (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs text-ink-3">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                className="peer sr-only"
              />
              <Checkbox checked={dontShowAgain} className={peerFocusRing} />
              Don&apos;t show this automatically again
            </label>
            <Button variant="ghost" size="sm" onClick={skip}>
              Skip — I&apos;ll fill it in manually
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
