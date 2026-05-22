import type { InvoiceData, InvoiceTotals, TaxGroup } from "@/types/invoice";

function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/** Amount for a single line item (quantity × rate). */
export function lineItemAmount(quantity: number, rate: number): number {
  return round2((Number(quantity) || 0) * (Number(rate) || 0));
}

/**
 * Computes per-item amounts, GST sub-totals grouped by rate, and the grand
 * total for an Indian GST invoice.
 */
export function computeTotals(data: InvoiceData): InvoiceTotals {
  const perItem = data.lineItems.map((li) => {
    const amount = lineItemAmount(li.quantity, li.rate);
    return {
      amount,
      cgst: round2(amount * ((Number(li.cgstRate) || 0) / 100)),
      sgst: round2(amount * ((Number(li.sgstRate) || 0) / 100)),
    };
  });

  const subTotal = round2(perItem.reduce((s, i) => s + i.amount, 0));

  const group = (key: "cgstRate" | "sgstRate", amountKey: "cgst" | "sgst"): TaxGroup[] => {
    const map = new Map<number, number>();
    data.lineItems.forEach((li, i) => {
      const rate = Number(li[key]) || 0;
      if (rate <= 0) return;
      map.set(rate, (map.get(rate) || 0) + perItem[i][amountKey]);
    });
    return [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([rate, amount]) => ({ rate, amount: round2(amount) }));
  };

  const cgstGroups = group("cgstRate", "cgst");
  const sgstGroups = group("sgstRate", "sgst");
  const totalCgst = round2(cgstGroups.reduce((s, g) => s + g.amount, 0));
  const totalSgst = round2(sgstGroups.reduce((s, g) => s + g.amount, 0));

  return {
    perItem,
    subTotal,
    cgstGroups,
    sgstGroups,
    totalCgst,
    totalSgst,
    total: round2(subTotal + totalCgst + totalSgst),
  };
}

/** Formats a number with Indian digit grouping and 2 decimals (e.g. 1,23,456.00). */
export function formatAmount(amount: number): string {
  return (Number(amount) || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Formats an amount prefixed with the rupee symbol (e.g. ₹41,241.00). */
export function formatRupees(amount: number): string {
  return `₹${formatAmount(amount)}`;
}

/** Converts an ISO date (YYYY-MM-DD) to DD/MM/YYYY for display. */
export function formatInvoiceDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

/** Words for a number below 100, with hyphenated tens (e.g. 41 -> "Forty-One"). */
function twoDigitWords(n: number): string {
  if (n < 20) return ONES[n];
  const tens = TENS[Math.floor(n / 10)];
  const one = ONES[n % 10];
  return one ? `${tens}-${one}` : tens;
}

/** Words for a number below 1000. */
function threeDigitWords(n: number): string {
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundred) parts.push(`${ONES[hundred]} Hundred`);
  if (rest) parts.push(twoDigitWords(rest));
  return parts.join(" ");
}

/** Converts a non-negative integer to words using the Indian numbering system. */
function integerToWords(n: number): string {
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;
  if (crore) parts.push(`${integerToWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigitWords(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigitWords(thousand)} Thousand`);
  if (rest) parts.push(threeDigitWords(rest));
  return parts.join(" ");
}

/**
 * Renders an amount as an Indian Rupee phrase, e.g.
 * "Indian Rupee Forty-One Thousand Two Hundred Forty-One Only".
 */
export function amountInWords(amount: number): string {
  const value = Math.max(0, Number(amount) || 0);
  const rupees = Math.floor(value);
  const paise = Math.round((value - rupees) * 100);

  let words = `Indian Rupee ${integerToWords(rupees)}`;
  if (paise > 0) words += ` And ${twoDigitWords(paise)} Paise`;
  return `${words} Only`;
}
