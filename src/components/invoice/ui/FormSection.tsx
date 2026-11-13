import { useId, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/components/ui/cn";

const pad = "px-[clamp(16px,2vw,24px)]";

interface FormSectionProps {
  title: ReactNode;
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
 * One titled group of fields inside a ruled form sheet. The sheet draws the
 * rules between sections (`divide-y`), so a section has no border of its own.
 */
export default function FormSection({ title, description, actions, flush = false, className, children }: FormSectionProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={cn("flex min-w-0 flex-col gap-4 bg-surface py-[22px]", className)}>
      <div className={cn("flex flex-wrap items-start justify-between gap-x-3 gap-y-2", pad)}>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id={headingId} className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
            {title}
          </h2>
          {description && <p className="text-[13px] text-ink-3 [text-wrap:pretty]">{description}</p>}
        </div>
        {actions}
      </div>
      <div className={cn("min-w-0", !flush && pad)}>{children}</div>
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
      className="flex flex-wrap gap-px bg-rule-2 [&>*]:min-w-0 [&>*]:grow [&>*]:basis-[min(var(--section-min),100%)]"
    >
      {children}
    </div>
  );
}
