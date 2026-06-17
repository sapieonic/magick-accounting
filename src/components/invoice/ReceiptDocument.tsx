import { Document, Page, View, Text, Image } from "@react-pdf/renderer";
import type { ReceiptData } from "@/types/invoice";
import {
  computeTotals,
  formatAmount,
  formatRupees,
  formatInvoiceDate,
  amountInWords,
} from "@/lib/invoice";
import { styles, COL, LOGO_PATH, MetaRow } from "./pdfBase";

export function ReceiptDocument({ data }: { data: ReceiptData }) {
  const totals = computeTotals(data);
  const received = Math.max(0, Number(data.payment.amountReceived) || 0);
  const balanceDue = Math.max(0, totals.total - received);
  const addressLines = data.seller.address
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  return (
    <Document title={`Payment Receipt ${data.receiptNumber}`}>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Image src={LOGO_PATH} style={styles.logo} />
          <View style={styles.headerRight}>
            <Text style={styles.docTitle}>PAYMENT RECEIPT</Text>
            <Text style={styles.invoiceNo}># {data.receiptNumber}</Text>
            <View style={styles.paidBadge}>
              <Text style={styles.paidBadgeText}>PAID</Text>
            </View>
            <Text style={styles.balanceLabel}>Amount Received</Text>
            <Text style={styles.balanceValue}>{formatRupees(received)}</Text>
          </View>
        </View>

        {/* Seller */}
        <View style={styles.seller}>
          <Text style={styles.partyLabel}>FROM</Text>
          <Text style={styles.sellerName}>{data.seller.name}</Text>
          {addressLines.map((line, i) => (
            <Text key={i} style={styles.sellerLine}>
              {line}
            </Text>
          ))}
          {data.seller.email ? <Text style={styles.sellerLine}>{data.seller.email}</Text> : null}
          {data.seller.gstin ? (
            <Text style={styles.sellerLine}>GSTIN: {data.seller.gstin}</Text>
          ) : null}
        </View>

        {/* Customer + receipt meta */}
        <View style={styles.midRow}>
          <View>
            <Text style={styles.partyLabel}>RECEIVED FROM</Text>
            <Text style={styles.customerName}>{data.customer.name}</Text>
            {data.customer.gstin ? (
              <Text style={styles.customerLine}>GSTIN {data.customer.gstin}</Text>
            ) : null}
            {data.hsnSac || data.placeOfSupply ? (
              <View style={styles.supplyBlock}>
                {data.hsnSac ? (
                  <Text style={styles.supplyLine}>HSN/SAC: {data.hsnSac}</Text>
                ) : null}
                {data.placeOfSupply ? (
                  <Text style={styles.supplyLine}>Place Of Supply: {data.placeOfSupply}</Text>
                ) : null}
              </View>
            ) : null}
          </View>
          <View style={styles.metaTable}>
            <MetaRow label="Payment Date :" value={formatInvoiceDate(data.payment.paidOn)} />
            <MetaRow label="Invoice Ref :" value={data.invoiceNumber} />
            <MetaRow label="Invoice Date :" value={formatInvoiceDate(data.invoiceDate)} />
          </View>
        </View>

        {/* Line items */}
        <View style={styles.table}>
          <View style={styles.tHead}>
            <Text style={[styles.th, { width: COL.sn }]}>#</Text>
            <Text style={[styles.th, { width: COL.desc }]}>Description</Text>
            <Text style={[styles.th, { width: COL.qty, textAlign: "right" }]}>Qty</Text>
            <Text style={[styles.th, { width: COL.rate, textAlign: "right" }]}>Rate</Text>
            <Text style={[styles.th, { width: COL.amount, textAlign: "right" }]}>Amount</Text>
          </View>

          {data.lineItems.map((li, i) => {
            const amt = totals.perItem[i];
            return (
              <View style={styles.tRow} key={i} wrap={false}>
                <Text style={[styles.td, { width: COL.sn }]}>{i + 1}</Text>
                <Text style={[styles.td, { width: COL.desc }]}>{li.description}</Text>
                <Text style={[styles.td, { width: COL.qty, textAlign: "right" }]}>
                  {formatAmount(li.quantity)}
                </Text>
                <Text style={[styles.td, { width: COL.rate, textAlign: "right" }]}>
                  {formatAmount(li.rate)}
                </Text>
                <Text style={[styles.td, { width: COL.amount, textAlign: "right" }]}>
                  {formatAmount(amt.amount)}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Totals */}
        <View style={styles.totals}>
          <View style={styles.totalsBox}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Sub Total</Text>
              <Text style={styles.totalValue}>{formatAmount(totals.subTotal)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>CGST ({totals.cgstRate}%)</Text>
              <Text style={styles.totalValue}>{formatAmount(totals.cgstAmount)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>SGST ({totals.sgstRate}%)</Text>
              <Text style={styles.totalValue}>{formatAmount(totals.sgstAmount)}</Text>
            </View>
            <View style={styles.grandRow}>
              <Text style={styles.grandLabel}>Total</Text>
              <Text style={styles.grandValue}>{formatRupees(totals.total)}</Text>
            </View>
            <View style={styles.receivedRow}>
              <Text style={styles.grandLabel}>Amount Received</Text>
              <Text style={styles.grandValue}>{formatRupees(received)}</Text>
            </View>
            <View style={styles.balanceRow}>
              <Text style={styles.grandLabel}>Balance Due</Text>
              <Text style={styles.grandValue}>{formatRupees(balanceDue)}</Text>
            </View>
          </View>
        </View>

        {/* Amount in words */}
        <View style={styles.words}>
          <Text style={styles.wordsLabel}>Received In Words:</Text>
          <Text style={styles.wordsValue}>{amountInWords(received)}</Text>
        </View>

        {/* Payment details */}
        <View style={styles.payment}>
          <Text style={styles.paymentTitle}>Payment Details</Text>
          <Text style={styles.paymentLine}>Payment Method: {data.payment.method}</Text>
          {data.payment.reference ? (
            <Text style={styles.paymentLine}>
              Transaction / Reference ID: {data.payment.reference}
            </Text>
          ) : null}
          <Text style={styles.paymentLine}>
            Payment Date: {formatInvoiceDate(data.payment.paidOn)}
          </Text>
        </View>

        {/* Footer */}
        <Text style={styles.footer} fixed>
          This is a computer-generated receipt and does not require a physical signature.
        </Text>
      </Page>
    </Document>
  );
}
