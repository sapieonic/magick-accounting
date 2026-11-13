"use client";

import { Children, cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/components/ui/cn";

export { inputClass, selectClass, textareaClass, aiFilledClass } from "@/components/ui/styles";

interface FieldProps {
  label: ReactNode;
  /** Single control (input/select/textarea/MultiSelect…). It receives `id`,
   * `aria-describedby` and `aria-invalid` automatically unless it sets them,
   * or `htmlFor` is given. */
  children: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Small lucide icon before the label. */
  icon?: LucideIcon;
  /** Right side of the label row, e.g. a "from receipt" marker. */
  aside?: ReactNode;
  /** Appends a visually quiet "optional". */
  optional?: boolean;
  /** Id of the labelled control inside a compound child (chips + input).
   * The child is then left untouched; describe the control with
   * `${htmlFor}-hint` / `${htmlFor}-error`. */
  htmlFor?: string;
  className?: string;
}

type ControlProps = { id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean | "true" | "false" };

/** Label + control + hint/error, stacked. Labels are 11px captions. */
export default function Field({
  label,
  children,
  hint,
  error,
  icon: Icon,
  aside,
  optional,
  htmlFor,
  className,
}: FieldProps) {
  const autoId = useId();
  const only =
    !htmlFor && Children.count(children) === 1 && isValidElement(children) ? (children as ReactElement<ControlProps>) : null;
  const controlId = htmlFor ?? only?.props.id ?? autoId;
  const hintId = hint && !error ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [only?.props["aria-describedby"], errorId, hintId].filter(Boolean).join(" ") || undefined;

  const control = only
    ? cloneElement(only, {
        id: controlId,
        "aria-describedby": describedBy,
        "aria-invalid": only.props["aria-invalid"] ?? (error ? true : undefined),
      })
    : children;

  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={controlId} className="cap flex items-center gap-1.5 text-ink-3">
          {Icon && <Icon aria-hidden="true" size={13} strokeWidth={1.8} />}
          <span>
            {label}
            {optional && <span className="font-normal normal-case tracking-normal">, optional</span>}
          </span>
        </label>
        {/* The marker keeps to one line, so labels in a FieldGrid row stay level. */}
        {aside && <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-accent">{aside}</span>}
      </div>
      {control}
      {error && (
        <p id={errorId} className="text-xs text-danger">
          {error}
        </p>
      )}
      {hintId && (
        <p id={hintId} className="text-xs text-ink-3">
          {hint}
        </p>
      )}
    </div>
  );
}
