import type { ReactNode } from "react";
import Panel from "@/components/ui/Panel";
import { cn } from "@/components/ui/cn";
import { amountInWords, formatInvoiceDate, formatRupees } from "@/lib/invoice";
import type { InvoiceTotals } from "@/types/invoice";

interface InvoiceSummaryProps {
  totals: InvoiceTotals;
  /** "Discount (10%)" etc.; shown only when a discount applies. */
  discountLabel: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  customerName: string;
  /** Line items that have a description (the ones that reach the PDF). */
  itemCount: number;
  /** Generate actions. */
  children?: ReactNode;
  className?: string;
}

function Row({ label, value, strong = false }: { label: ReactNode; value: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className={cn("min-w-0", strong ? "text-ink" : "text-ink-3")}>{label}</dt>
      <dd className="num whitespace-nowrap text-right text-ink">{value}</dd>
    </div>
  );
}

/** Live preview of the invoice head and its GST breakdown, beside the form. */
export default function InvoiceSummary({
  totals,
  discountLabel,
  invoiceNumber,
  invoiceDate,
  dueDate,
  customerName,
  itemCount,
  children,
  className,
}: InvoiceSummaryProps) {
  const hasDiscount = totals.discountAmount > 0;
  return (
    <Panel
      title="Summary"
      meta={`${itemCount} ${itemCount === 1 ? "item" : "items"}`}
      wash
      className={className}
      bodyClassName="gap-4 [container-type:inline-size]"
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
        <div className="col-span-2 min-w-0">
          <dt className="cap text-ink-3">Bill to</dt>
          <dd className={cn("ell mt-0.5 text-sm", customerName ? "font-medium text-ink" : "text-ink-3")}>
            {customerName || "No customer yet"}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="cap text-ink-3">Invoice no.</dt>
          <dd className="num ell mt-0.5 text-ink">{invoiceNumber || "—"}</dd>
        </div>
        <div className="min-w-0">
          <dt className="cap text-ink-3">{dueDate ? "Dated · due" : "Dated"}</dt>
          <dd className="num mt-0.5 text-ink">
            {formatInvoiceDate(invoiceDate)}
            {dueDate && <span className="text-ink-3"> · {formatInvoiceDate(dueDate)}</span>}
          </dd>
        </div>
      </dl>

      <dl className="border-t border-rule-2 pt-2 text-sm">
        <Row label="Sub Total" value={formatRupees(totals.subTotal)} />
        {hasDiscount && <Row label={discountLabel} value={`-${formatRupees(totals.discountAmount)}`} />}
        {hasDiscount && <Row label="Taxable Amount" value={formatRupees(totals.taxableAmount)} />}
        <Row label={`CGST (${totals.cgstRate}%)`} value={formatRupees(totals.cgstAmount)} />
        <Row label={`SGST (${totals.sgstRate}%)`} value={formatRupees(totals.sgstAmount)} />
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 border-t border-rule pt-3">
          <dt className="text-sm font-semibold text-ink">Total</dt>
          <dd className="figure text-[clamp(22px,9cqi,30px)] font-semibold text-ink">{formatRupees(totals.total)}</dd>
        </div>
      </dl>
      <p className="-mt-2 text-xs text-ink-3 [text-wrap:pretty]">{amountInWords(totals.total)}</p>

      {children}
    </Panel>
  );
}
