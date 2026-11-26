import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/components/ui/cn";

/**
 * A formatted money string as `formatCurrency` writes it: an optional minus,
 * a currency sign (₹, $, A$, JP¥) or a 3-letter code and a (non-breaking) space ("AED 1,000.00",
 * the unknown-code fallback), digits with group commas, then exactly two decimals.
 */
const MONEY = /^(-?(?:[A-Z]{0,3}\p{Sc}|[A-Z]{3}\s)[\d,]*\d)(\.\d{2})$/u;

/**
 * "₹2,42,356.12" -> ["₹2,42,356", ".12"]. Anything that isn't a money string
 * ("3.25", "v1.16", "₹3.12L", "12.50%", "₹950") stays whole: ["…", ""].
 */
export function splitPaise(text: string): [string, string] {
  const match = MONEY.exec(text);
  return match ? [match[1], match[2]] : [text, ""];
}

/**
 * A formatted amount with the paisa set quieter than the rupees (the Ledger
 * signature, `.paise`). Takes the already formatted string, so screen readers
 * and copy still get one figure. Non-strings and non-money strings pass
 * through untouched.
 */
export function withPaise(value: ReactNode): ReactNode {
  if (typeof value !== "string") return value;
  const [whole, paise] = splitPaise(value);
  if (!paise) return value;
  return (
    <>
      {whole}
      <span className="paise">{paise}</span>
    </>
  );
}

interface MoneyProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  /** The formatted amount, e.g. formatBaseCurrency(total). */
  value: string;
  /** Follows the figure inside the span, e.g. an sr-only "(awaiting approval)". */
  children?: ReactNode;
}

/**
 * A figure that stands on its own: mono tabular digits, never wraps, paisa
 * muted. Use it wherever an amount is shown outside a sentence; primitives that
 * take a pre-formatted string (Stat, RankedBar) call `withPaise` themselves.
 */
export default function Money({ value, className, children, ...rest }: MoneyProps) {
  return (
    <span {...rest} className={cn("num whitespace-nowrap", className)}>
      {withPaise(value)}
      {children}
    </span>
  );
}
