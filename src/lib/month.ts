/**
 * "YYYY-MM" month keys: the Overview's monthly buckets and the Expenses
 * page's `month` filter. Client-safe.
 */

/** A valid "YYYY-MM" month key. */
export const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

/** The "YYYY-MM" key of `date`'s month, in local time. */
export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** First day of a "YYYY-MM" month key, in local time. */
export function monthFromKey(key: string): Date {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

/**
 * How far into a "YYYY-MM" month the server's buckets (UTC) are: today's
 * UTC day while it is the current month, else the whole month.
 */
export function monthProgress(key: string, now: Date = new Date()): { day: number; days: number } {
  const [year, month] = key.split("-").map(Number);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const current = now.getUTCFullYear() === year && now.getUTCMonth() + 1 === month;
  return { day: current ? now.getUTCDate() : days, days };
}
