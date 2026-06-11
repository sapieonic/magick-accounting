// Shared invoice types — used by the form page, the generate API route,
// and the PDF template component. Models an Indian GST tax invoice.

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  rate: number;
}

export interface InvoiceSeller {
  name: string;
  /** Multi-line address (free text, newlines allowed). */
  address: string;
  email: string;
  gstin: string;
}

export interface InvoiceCustomer {
  name: string;
  gstin: string;
}

export interface BankDetails {
  accountName: string;
  accountNumber: string;
  accountType: string;
  ifsc: string;
}

export interface InvoiceData {
  /** Invoice number — defaults to an epoch timestamp. */
  invoiceNumber: string;
  /** ISO date string (YYYY-MM-DD). */
  invoiceDate: string;
  /** ISO date string (YYYY-MM-DD). */
  dueDate?: string;
  /** Payment terms, free text (e.g. "Custom", "Due on Receipt"). */
  terms?: string;
  /** Company-wide HSN (goods) / SAC (services) code. */
  hsnSac?: string;
  /** Place of supply, e.g. "Telangana (36)". */
  placeOfSupply?: string;
  /** CGST rate as a percentage applied to the invoice sub-total, e.g. 9 for 9%. */
  cgstRate: number;
  /** SGST rate as a percentage applied to the invoice sub-total, e.g. 9 for 9%. */
  sgstRate: number;
  seller: InvoiceSeller;
  customer: InvoiceCustomer;
  lineItems: InvoiceLineItem[];
  bank?: BankDetails;
}

/** Supported payment methods for a payment receipt. */
export type PaymentMethod = "Bank Transfer" | "UPI" | "Card" | "Cheque" | "Cash";

export const PAYMENT_METHODS: PaymentMethod[] = [
  "Bank Transfer",
  "UPI",
  "Card",
  "Cheque",
  "Cash",
];

export interface ReceiptPayment {
  /** How the payment was made (e.g. "Bank Transfer", "UPI"). */
  method: string;
  /** Transaction / UTR / UPI / cheque reference number. Optional for cash. */
  reference: string;
  /** ISO date string (YYYY-MM-DD) the payment was received. */
  paidOn: string;
  /** Amount actually received. Balance due = invoice total − this. */
  amountReceived: number;
}

/**
 * A payment receipt reuses the full invoice shape (so the line items, totals
 * and parties match the invoice it acknowledges) and adds payment details plus
 * its own receipt number. `invoiceNumber` is reused as the referenced invoice.
 */
export interface ReceiptData extends InvoiceData {
  /** Receipt number — distinct from the referenced invoice number. */
  receiptNumber: string;
  payment: ReceiptPayment;
}

/** Per-line-item derived amounts, index-aligned with InvoiceData.lineItems. */
export interface LineItemAmounts {
  amount: number;
}

export interface InvoiceTotals {
  perItem: LineItemAmounts[];
  subTotal: number;
  /** CGST rate applied to the sub-total (percentage). */
  cgstRate: number;
  /** SGST rate applied to the sub-total (percentage). */
  sgstRate: number;
  cgstAmount: number;
  sgstAmount: number;
  total: number;
}
