"use client";

import type { ReactNode } from "react";
import { FormFooter } from "@/components/ui/FormSection";
import { cn } from "@/components/ui/cn";

interface BulkBarProps {
  /** Names the strip for assistive tech, e.g. "Selection". */
  label?: string;
  /** What the actions apply to: "3 selected · ₹4,560". */
  summary: ReactNode;
  /** The actions, last one primary (e.g. Reject…, Approve 3). */
  children: ReactNode;
  className?: string;
}

/**
 * The sticky action strip for a selection on a list page: just above the
 * mobile tab bar, at the bottom edge from `lg` up. Built on `FormFooter`, so
 * toasts and focused rows stay clear of it. Render it as the page root's last
 * child, only while something is selected.
 */
export default function BulkBar({ label = "Selection", summary, children, className }: BulkBarProps) {
  return (
    <FormFooter
      role="region"
      aria-label={label}
      className={cn("rounded-panel border border-rule", className)}
    >
      <p className="mr-auto min-w-0 text-sm font-medium text-ink">{summary}</p>
      <div className="flex grow flex-wrap justify-end gap-2 sm:grow-0 [&>*]:grow sm:[&>*]:grow-0">{children}</div>
    </FormFooter>
  );
}
