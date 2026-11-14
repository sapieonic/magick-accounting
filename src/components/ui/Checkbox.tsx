import { Check } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { transition } from "@/components/ui/styles";

interface CheckboxProps {
  checked: boolean;
  /** Some but not all of a group are checked (a "select all" row): a dash instead of the tick. */
  partial?: boolean;
  className?: string;
}

/**
 * The visual checkbox box, for rows that are themselves the control (a
 * listbox option, a label wrapping an sr-only input). Decorative: the row
 * carries the checked state (aria-selected / the input).
 */
export default function Checkbox({ checked, partial = false, className }: CheckboxProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
        transition,
        checked || partial ? "border-accent bg-accent text-accent-ink" : "border-control-line bg-surface",
        className
      )}
    >
      {checked ? (
        <Check className="h-3 w-3" strokeWidth={2.5} />
      ) : partial ? (
        <span className="h-0.5 w-2 rounded bg-accent-ink" />
      ) : null}
    </span>
  );
}
