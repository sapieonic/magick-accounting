export const BASE_CURRENCY_CODE = "INR";

/**
 * Format an amount with the correct currency symbol and separators.
 * Uses Intl.NumberFormat for locale-aware formatting.
 */
export function formatCurrency(amount: number, currencyCode: string = BASE_CURRENCY_CODE): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Fallback for unknown currency codes
    return `${currencyCode} ${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

/**
 * Format an amount in the base currency (INR).
 */
export function formatBaseCurrency(amount: number): string {
  return formatCurrency(amount, BASE_CURRENCY_CODE);
}
