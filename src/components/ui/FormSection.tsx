"use client";

import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { panelPadX } from "@/components/ui/styles";

interface FormSectionProps {
  /** Section heading (h2); omit for an untitled group (notes, extras). */
  title?: ReactNode;
  /** One quiet line under the title. */
  description?: ReactNode;
  /** Buttons right of the title. */
  actions?: ReactNode;
  /** Body without side padding, for edge-to-edge tables. */
  flush?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * One group of fields inside a ruled form sheet (`panelClass` + `divide-y
 * divide-rule-2`). The sheet draws the rules between sections, so a section
 * has no border of its own.
 */
export default function FormSection({ title, description, actions, flush = false, className, children }: FormSectionProps) {
  const headingId = useId();
  const hasHead = title || description || actions;
  return (
    <section
      aria-labelledby={title ? headingId : undefined}
      className={cn("flex min-w-0 flex-col gap-4 py-[22px]", className)}
    >
      {hasHead && (
        <div className={cn("flex flex-wrap items-start justify-between gap-x-3 gap-y-2", panelPadX)}>
          <div className="flex min-w-0 flex-col gap-0.5">
            {title && (
              <h2 id={headingId} className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
                {title}
              </h2>
            )}
            {description && <p className="text-[13px] text-ink-3 [text-wrap:pretty]">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className={cn("flex min-w-0 flex-col gap-4", !flush && panelPadX)}>{children}</div>
    </section>
  );
}

/** Auto-fit grid of `Field`s: as many columns of at least `min` px as fit. */
export function FieldGrid({ min = 200, className, children }: { min?: number; className?: string; children: ReactNode }) {
  return (
    <div
      style={{ "--field-min": `${min}px` } as CSSProperties}
      className={cn("grid grid-cols-[repeat(auto-fit,minmax(min(var(--field-min),100%),1fr))] gap-4", className)}
    >
      {children}
    </div>
  );
}

/** Two or more sections side by side, split by a 1px rule; they stack when narrow. */
export function SectionRow({ min = 320, children }: { min?: number; children: ReactNode }) {
  return (
    <div
      style={{ "--section-min": `${min}px` } as CSSProperties}
      className="flex flex-wrap gap-px bg-rule-2 [&>*]:min-w-0 [&>*]:grow [&>*]:basis-[min(var(--section-min),100%)] [&>*]:bg-surface"
    >
      {children}
    </div>
  );
}

/** CSS variable on <html> holding the mounted FormFooter's height (toasts sit above it). */
export const FORM_FOOTER_HEIGHT_VAR = "--form-footer-h";

/**
 * The action strip at the foot of a form sheet. It sticks to the bottom of
 * the scrolling page, just above the mobile tab bar (`--tabbar-h`, 0 from `lg`
 * up). While mounted it publishes its height (it grows when its contents wrap)
 * as `--form-footer-h` on <html>, so fixed layers such as toasts clear it.
 */
export function FormFooter({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement.style;
    const publish = () => root.setProperty(FORM_FOOTER_HEIGHT_VAR, `${Math.ceil(el.getBoundingClientRect().height)}px`);
    publish();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(publish);
    observer?.observe(el);
    return () => {
      observer?.disconnect();
      root.removeProperty(FORM_FOOTER_HEIGHT_VAR);
    };
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        "sticky bottom-[var(--tabbar-h)] z-10 mt-auto flex flex-wrap items-center gap-3 rounded-b-panel border-t border-rule bg-surface py-3",
        panelPadX,
        className
      )}
    >
      {children}
    </div>
  );
}
