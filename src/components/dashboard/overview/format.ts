import { BASE_CURRENCY_CODE } from "@/lib/currency";

const compact = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: BASE_CURRENCY_CODE,
  notation: "compact",
  maximumSignificantDigits: 3,
});

/** Short base-currency label for chart bars, e.g. "₹5.04L", "₹48.2K". */
export function formatCompactBase(amount: number): string {
  return compact.format(amount);
}

/** `part` as a percentage of `whole` (0 when there is no whole). */
export function percentOf(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0;
}

/** "1 expense", "3 expenses". */
export function plural(count: number, noun: string, pluralNoun = `${noun}s`): string {
  return `${count.toLocaleString("en-IN")} ${count === 1 ? noun : pluralNoun}`;
}
