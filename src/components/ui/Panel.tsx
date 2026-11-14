import { useId, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { panelClass, panelPadX } from "@/components/ui/styles";

interface PanelProps {
  /** Section heading (h2). Also labels the section for assistive tech. */
  title?: ReactNode;
  /** One quiet line under the title. */
  description?: ReactNode;
  /** Small note right of the title (units, ranges). */
  meta?: ReactNode;
  /** Links/buttons right of the title. */
  actions?: ReactNode;
  /** Ruled footer strip (pagination, totals). */
  footer?: ReactNode;
  /** Body without padding, for edge-to-edge row lists and tables. */
  flush?: boolean;
  /** Relative width inside a PanelGrid (flex-grow). Default 1. */
  grow?: number;
  /** Faint indigo wash in the head corner (detail panels, headline totals). */
  wash?: boolean;
  className?: string;
  bodyClassName?: string;
  children?: ReactNode;
  id?: string;
}

/**
 * A ruled section: 1px rule, 8px radius, no shadow. Standalone it draws its
 * own border; inside a PanelGrid the grid's 1px gaps draw the rules instead.
 */
export default function Panel({
  title,
  description,
  meta,
  actions,
  footer,
  flush = false,
  grow,
  wash = false,
  className,
  bodyClassName,
  children,
  id,
}: PanelProps) {
  const headingId = useId();
  const hasHead = title || description || meta || actions;
  return (
    <section
      id={id}
      aria-labelledby={title ? headingId : undefined}
      className={cn(panelClass, "flex min-w-0 flex-col", wash && "bg-wash", className)}
      style={grow ? { flexGrow: grow } : undefined}
    >
      {hasHead && (
        <div className={cn("flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 pb-3 pt-5", panelPadX)}>
          {(title || description) && (
            <div className="flex min-w-0 flex-col gap-0.5">
              {title && (
                <h2 id={headingId} className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
                  {title}
                </h2>
              )}
              {description && <p className="text-[13px] text-ink-3 [text-wrap:pretty]">{description}</p>}
            </div>
          )}
          {(meta || actions) && (
            // Bare action links get `target24` (24px, WCAG 2.5.8), spelled out
            // under the [&>a] variant since Tailwind needs literal classes.
            <div className="ml-auto flex flex-wrap items-baseline gap-3 text-[13px] text-ink-3 [&>a]:inline-flex [&>a]:min-h-6 [&>a]:items-center">
              {meta && <span className="text-xs">{meta}</span>}
              {actions}
            </div>
          )}
        </div>
      )}
      <div className={cn("flex min-w-0 flex-1 flex-col", !flush && cn(panelPadX, "pb-5", !hasHead && "pt-5"), bodyClassName)}>
        {children}
      </div>
      {footer && (
        <div className={cn("flex flex-wrap items-center justify-between gap-3 border-t border-rule py-2.5 text-[13px] text-ink-3", panelPadX)}>
          {footer}
        </div>
      )}
    </section>
  );
}

interface PanelGridProps {
  /** Minimum panel width in px before panels wrap to a new line. Default 440. */
  min?: number;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
}

/**
 * One ruled sheet of panels that fills the width evenly and wraps: children
 * share a single outer border and are separated by 1px rules.
 */
export function PanelGrid({ min = 440, className, children, ...rest }: PanelGridProps) {
  return (
    <div
      {...rest}
      style={{ "--panel-min": `${min}px` } as CSSProperties}
      className={cn(
        "flex flex-wrap gap-px overflow-hidden rounded-panel border border-rule bg-rule",
        "[&>*]:min-w-0 [&>*]:grow [&>*]:basis-[min(var(--panel-min),100%)] [&>*]:rounded-none [&>*]:border-0",
        className
      )}
    >
      {children}
    </div>
  );
}
