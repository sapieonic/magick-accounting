"use client";

import { useEffect, useRef, useState } from "react";
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

/** Nearest ancestor that scrolls vertically (the dashboard's <main>), else the page. */
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let node = el?.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll") return node;
  }
  return null;
}

/**
 * The section being read: the last one whose top has scrolled above the
 * reading line. At the very bottom, sections below the line can't scroll any
 * higher, so a clicked section still in view wins, else the last section.
 */
export function pickActiveSection(
  ids: string[],
  { line, viewportHeight, atBottom, clicked }: { line: number; viewportHeight: number; atBottom: boolean; clicked: string | null }
): string | undefined {
  const rects = new Map<string, DOMRect>();
  ids.forEach((id) => {
    const rect = document.getElementById(id)?.getBoundingClientRect();
    // Skip sections that aren't laid out (hidden, or no layout at all).
    if (rect && rect.height > 0) rects.set(id, rect);
  });
  const visible = (id: string) => {
    const r = rects.get(id);
    return !!r && r.top < viewportHeight && r.bottom > 0;
  };
  if (clicked && visible(clicked)) return clicked;
  if (atBottom) {
    const last = [...ids].reverse().find(visible);
    if (last) return last;
  }
  let current = ids[0];
  for (const id of ids) {
    const r = rects.get(id);
    if (r && r.top <= line) current = id;
  }
  return current;
}

/**
 * The horizontal scroll position that brings `link` fully into view inside
 * `strip` (a 16px margin keeps it off the edge), or null when it already fits
 * or the strip doesn't scroll. Sets scrollLeft rather than calling
 * scrollIntoView, which would also scroll the page's vertical scroller.
 */
export function stripScrollLeftFor(strip: HTMLElement, link: HTMLElement, margin = 16): number | null {
  if (strip.scrollWidth <= strip.clientWidth) return null;
  const stripRect = strip.getBoundingClientRect();
  const linkRect = link.getBoundingClientRect();
  const left = linkRect.left - stripRect.left + strip.scrollLeft;
  const right = left + linkRect.width;
  if (left - margin < strip.scrollLeft) return Math.max(0, left - margin);
  if (right + margin > strip.scrollLeft + strip.clientWidth) {
    return Math.min(strip.scrollWidth - strip.clientWidth, right + margin - strip.clientWidth);
  }
  return null;
}

/**
 * In-page section nav: a sticky horizontal scroller on narrow screens, a
 * sticky vertical list beside the panels from `xl`. Highlights the section
 * in view (aria-current="location").
 */
export default function SettingsNav({ sections }: { sections: SettingsSection[] }) {
  const [active, setActive] = useState(sections[0]?.id);
  const navRef = useRef<HTMLElement>(null);
  const stripRef = useRef<HTMLUListElement>(null);
  // A clicked section stays highlighted while it is on screen, until the
  // person scrolls by hand (it may be too short to reach the reading line).
  const clicked = useRef<string | null>(null);

  useEffect(() => {
    const ids = sections.map((s) => s.id);
    const scroller = scrollParent(navRef.current);
    let frame = 0;

    const update = () => {
      frame = 0;
      const viewportHeight = window.innerHeight;
      const atBottom = scroller
        ? scroller.scrollHeight > scroller.clientHeight &&
          scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4
        : window.scrollY > 0 && window.scrollY + viewportHeight >= document.documentElement.scrollHeight - 4;
      const next = pickActiveSection(ids, {
        line: Math.max(160, viewportHeight * 0.3),
        viewportHeight,
        atBottom,
        clicked: clicked.current,
      });
      if (next) setActive(next);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const release = () => {
      clicked.current = null;
    };
    // Dragging the scroller's own scrollbar scrolls by hand too; a press on
    // the page's content (its target is a descendant) doesn't count.
    const scrollbarTarget: HTMLElement = scroller ?? document.documentElement;
    const releaseOnScrollbar = (e: PointerEvent) => {
      if (e.target === scrollbarTarget) release();
    };

    const target: HTMLElement | Window = scroller ?? window;
    target.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("wheel", release, { passive: true });
    window.addEventListener("touchmove", release, { passive: true });
    window.addEventListener("keydown", release);
    scrollbarTarget.addEventListener("pointerdown", releaseOnScrollbar);
    update();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      target.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("wheel", release);
      window.removeEventListener("touchmove", release);
      window.removeEventListener("keydown", release);
      scrollbarTarget.removeEventListener("pointerdown", releaseOnScrollbar);
    };
  }, [sections]);

  // On phones the strip scrolls sideways: keep the highlighted link in it.
  useEffect(() => {
    const strip = stripRef.current;
    const link = strip?.children[sections.findIndex((s) => s.id === active)];
    if (!strip || !(link instanceof HTMLElement)) return;
    const left = stripScrollLeftFor(strip, link);
    if (left !== null) strip.scrollLeft = left;
  }, [active, sections]);

  return (
    <nav
      ref={navRef}
      aria-label="Settings sections"
      className={cn(
        "sticky top-0 z-10 -mx-[var(--pad)] border-b border-rule bg-background px-[var(--pad)]",
        // From xl it sits beside the sections: line its top up with their scroll-mt-6.
        "xl:top-6 xl:mx-0 xl:w-[200px] xl:shrink-0 xl:border-0 xl:bg-transparent xl:px-0"
      )}
    >
      <ul ref={stripRef} className="flex gap-1 overflow-x-auto py-1.5 xl:flex-col xl:overflow-visible xl:py-0">
        {sections.map(({ id, label, icon: Icon }) => {
          const current = active === id;
          return (
            <li key={id} className="shrink-0">
              <a
                href={`#${id}`}
                onClick={() => {
                  clicked.current = id;
                  setActive(id);
                }}
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
