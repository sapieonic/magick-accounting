import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

/** Horizontal padding of form panel sections (matches Panel). */
export const FORM_PAD_X = "px-[clamp(16px,2vw,24px)]";

/**
 * The action strip at the foot of a form panel. It sticks to the bottom of
 * the scrolling page: above the mobile tab bar, at the edge from `lg` up.
 */
export default function FormFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "sticky bottom-[calc(55px+max(10px,env(safe-area-inset-bottom)))] z-10 mt-auto flex flex-wrap items-center gap-3 rounded-b-panel border-t border-rule bg-surface py-3 lg:bottom-0",
        FORM_PAD_X,
        className
      )}
    >
      {children}
    </div>
  );
}
