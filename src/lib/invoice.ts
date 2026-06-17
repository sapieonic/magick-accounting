import type {
  InvoiceData,
  InvoiceLineItem,
  InvoiceTotals,
  ReceiptData,
} from "@/types/invoice";

function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

const str = (v: unknown) => String(v ?? "").trim();
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates and normalizes a raw request body into a clean InvoiceData object,
 * or returns an error message string. Shared by the invoice and receipt routes.
 */
export function parseInvoice(body: unknown): InvoiceData | string {
  if (!body || typeof body !== "object") return "Invalid request body";
  const b = body as Record<string, unknown>;

  const invoiceNumber = str(b.invoiceNumber);
  if (!invoiceNumber) return "Invoice number is required";

  const invoiceDate = str(b.invoiceDate);
  if (!ISO_DATE.test(invoiceDate)) return "A valid invoice date is required";

  const dueDate = b.dueDate ? str(b.dueDate) : undefined;
  if (dueDate && !ISO_DATE.test(dueDate)) return "Due date is invalid";

  const seller = (b.seller ?? {}) as Record<string, unknown>;
  const customer = (b.customer ?? {}) as Record<string, unknown>;
  if (!str(seller.name)) return "Seller name is required";
  if (!str(customer.name)) return "Customer name is required";

  const lineItems: InvoiceLineItem[] = (Array.isArray(b.lineItems) ? b.lineItems : [])
    .map((it) => {
      const item = it as Record<string, unknown>;
      return {
        description: str(item.description),
        quantity: num(item.quantity),
        rate: num(item.rate),
      };
    })
    .filter((it) => it.description !== "");

  if (lineItems.length === 0) {
    return "At least one line item with a description is required";
  }

  const bank = (b.bank ?? {}) as Record<string, unknown>;

  return {
    invoiceNumber,
    invoiceDate,
    dueDate,
    terms: b.terms ? str(b.terms) : undefined,
    hsnSac: b.hsnSac ? str(b.hsnSac) : undefined,
    placeOfSupply: b.placeOfSupply ? str(b.placeOfSupply) : undefined,
    cgstRate: num(b.cgstRate),
    sgstRate: num(b.sgstRate),
    seller: {
      name: str(seller.name),
      address: str(seller.address),
      email: str(seller.email),
      gstin: str(seller.gstin),
    },
    customer: {
      name: str(customer.name),
      gstin: str(customer.gstin),
    },
    lineItems,
    bank: {
      accountName: str(bank.accountName),
      accountNumber: str(bank.accountNumber),
      accountType: str(bank.accountType),
      ifsc: str(bank.ifsc),
    },
  };
}

/**
 * Validates and normalizes a raw request body into a ReceiptData object, or
 * returns an error message string. Builds on parseInvoice and adds the payment
 * block. Amount received defaults to the full invoice total when omitted.
 */
export function parseReceipt(body: unknown): ReceiptData | string {
  const invoice = parseInvoice(body);
  if (typeof invoice === "string") return invoice;

  const b = body as Record<string, unknown>;

  const receiptNumber = str(b.receiptNumber);
  if (!receiptNumber) return "Receipt number is required";

  const payment = (b.payment ?? {}) as Record<string, unknown>;
  const method = str(payment.method);
  if (!method) return "Payment method is required";

  const paidOn = str(payment.paidOn);
  if (!ISO_DATE.test(paidOn)) return "A valid payment date is required";

  const total = computeTotals(invoice).total;
  const received = payment.amountReceived != null ? num(payment.amountReceived) : total;

  return {
    ...invoice,
    receiptNumber,
    payment: {
      method,
      reference: str(payment.reference),
      paidOn,
      amountReceived: received,
    },
  };
}

/** Amount for a single line item (quantity × rate). */
export function lineItemAmount(quantity: number, rate: number): number {
  return round2((Number(quantity) || 0) * (Number(rate) || 0));
}

/**
 * Computes per-item amounts and the grand total for an Indian GST invoice.
 * CGST and SGST are invoice-level rates applied directly to the sub-total.
 */
export function computeTotals(data: InvoiceData): InvoiceTotals {
  const perItem = data.lineItems.map((li) => ({
    amount: lineItemAmount(li.quantity, li.rate),
  }));

  const subTotal = round2(perItem.reduce((s, i) => s + i.amount, 0));

  const cgstRate = Math.max(0, Number(data.cgstRate) || 0);
  const sgstRate = Math.max(0, Number(data.sgstRate) || 0);
  const cgstAmount = round2(subTotal * (cgstRate / 100));
  const sgstAmount = round2(subTotal * (sgstRate / 100));

  return {
    perItem,
    subTotal,
    cgstRate,
    sgstRate,
    cgstAmount,
    sgstAmount,
    total: round2(subTotal + cgstAmount + sgstAmount),
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
