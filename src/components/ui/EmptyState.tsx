"use client";

import { ReactNode, type Ref } from "react";
import { sectionTitleClass } from "@/components/ui/styles";
import { cn } from "@/components/ui/cn";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  /** Makes the heading focusable (tabIndex -1) and hands it over, e.g. to move focus here once a list empties. */
  headingRef?: Ref<HTMLHeadingElement>;
}

export default function EmptyState({ icon, title, description, action, headingRef }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-panel bg-sunk text-ink-3 ring-1 ring-inset ring-rule-2 [&_svg]:h-5 [&_svg]:w-5 [&_svg]:stroke-[1.5]">
        {icon}
      </div>
      <h3 ref={headingRef} tabIndex={headingRef ? -1 : undefined} className={cn("mb-1 rounded-control", sectionTitleClass)}>
        {title}
      </h3>
      <p className="max-w-sm text-sm text-ink-3 [text-wrap:pretty]">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
