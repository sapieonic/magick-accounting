"use client";

import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { ICON_STROKE, focusRing, transition } from "@/components/ui/styles";

export interface SettingsSection {
  id: string;
  label: string;
  icon: LucideIcon;
}

/** Keeps a section's heading clear of the sticky phone nav when jumped to. */
export const settingsSectionClass = "scroll-mt-20 xl:scroll-mt-6";

/**
 * In-page section nav: a sticky horizontal scroller on narrow screens, a
 * sticky vertical list beside the panels from `xl`. Highlights the section
 * in view (aria-current="location").
 */
export default function SettingsNav({ sections }: { sections: SettingsSection[] }) {
  const [active, setActive] = useState(sections[0]?.id);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const top = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(top.target.id);
      },
      { rootMargin: "0px 0px -65% 0px" }
    );
    sections.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav
      aria-label="Settings sections"
      className={cn(
        "sticky top-0 z-10 -mx-[var(--pad)] border-b border-rule bg-background px-[var(--pad)]",
        "xl:mx-0 xl:w-[200px] xl:shrink-0 xl:border-0 xl:bg-transparent xl:px-0"
      )}
    >
      <ul className="flex gap-1 overflow-x-auto py-1.5 xl:flex-col xl:overflow-visible xl:py-0">
        {sections.map(({ id, label, icon: Icon }) => {
          const current = active === id;
          return (
            <li key={id} className="shrink-0">
              <a
                href={`#${id}`}
                onClick={() => setActive(id)}
                aria-current={current ? "location" : undefined}
                className={cn(
                  "flex h-11 items-center gap-2 whitespace-nowrap rounded-control px-3 text-sm",
                  transition,
                  focusRing,
                  current ? "bg-accent-soft font-medium text-accent" : "text-ink-2 hover:bg-hover hover:text-ink"
                )}
              >
                <Icon aria-hidden="true" size={16} strokeWidth={ICON_STROKE} className="shrink-0" />
                {label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
