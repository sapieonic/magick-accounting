// Shared invoice types — used by the form page, the generate API route,
// and the PDF template component. Models an Indian GST tax invoice.

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  rate: number;
  /** CGST rate as a percentage, e.g. 9 for 9%. */
  cgstRate: number;
  /** SGST rate as a percentage, e.g. 9 for 9%. */
  sgstRate: number;
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
  seller: InvoiceSeller;
  customer: InvoiceCustomer;
  lineItems: InvoiceLineItem[];
  bank?: BankDetails;
}

/** A tax sub-total grouped by rate, e.g. { rate: 9, amount: 3145.5 }. */
export interface TaxGroup {
  rate: number;
  amount: number;
}

/** Per-line-item derived amounts, index-aligned with InvoiceData.lineItems. */
export interface LineItemAmounts {
  amount: number;
  cgst: number;
  sgst: number;
}

export interface InvoiceTotals {
  perItem: LineItemAmounts[];
  subTotal: number;
  cgstGroups: TaxGroup[];
  sgstGroups: TaxGroup[];
  totalCgst: number;
  totalSgst: number;
  total: number;
}
