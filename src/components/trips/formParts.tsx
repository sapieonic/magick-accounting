import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { focusRing, transition } from "@/components/ui/styles";

/** Modal action row, pinned to the bottom of the scrolling sheet. */
export const MODAL_FOOTER =
  "sticky bottom-0 -mx-5 mt-1 flex flex-col-reverse gap-2 border-t border-rule bg-surface px-5 py-3 sm:flex-row sm:items-center sm:justify-end";

/** A picked value (place, person) with a button that removes it. */
export function RemovableChip({ label, removeLabel, onRemove }: { label: ReactNode; removeLabel: string; onRemove: () => void }) {
  return (
    <span className="inline-flex h-8 max-w-full items-center gap-1 rounded-control bg-accent-soft pl-2.5 text-[13px] font-medium text-accent">
      <span className="ell">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        className={cn("flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-control hover:bg-tint-2", transition, focusRing)}
      >
        <X aria-hidden="true" size={13} strokeWidth={1.75} />
      </button>
    </span>
  );
}
