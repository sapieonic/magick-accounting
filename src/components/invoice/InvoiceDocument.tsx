import path from "path";
import { Document, Page, View, Text, Image, StyleSheet, Font } from "@react-pdf/renderer";
import type { InvoiceData } from "@/types/invoice";
import {
  computeTotals,
  formatAmount,
  formatRupees,
  formatInvoiceDate,
  amountInWords,
} from "@/lib/invoice";

// Roboto is registered because the default PDF font (Helvetica) has no rupee
// glyph (₹). Files live in public/invoice/ so they ship with every deployment.
const ASSET_DIR = path.join(process.cwd(), "public", "invoice");

Font.register({
  family: "Roboto",
  fonts: [
    { src: path.join(ASSET_DIR, "fonts", "Roboto-Regular.ttf") },
    { src: path.join(ASSET_DIR, "fonts", "Roboto-Bold.ttf"), fontWeight: 700 },
    { src: path.join(ASSET_DIR, "fonts", "Roboto-Italic.ttf"), fontStyle: "italic" },
    {
      src: path.join(ASSET_DIR, "fonts", "Roboto-BoldItalic.ttf"),
      fontWeight: 700,
      fontStyle: "italic",
    },
  ],
});
// Keep long words (numbers, GSTINs) from being hyphenated.
Font.registerHyphenationCallback((word) => [word]);

const LOGO_PATH = path.join(ASSET_DIR, "logo.png");

const INK = "#33373d";
const MUTED = "#7b8087";
const LINE = "#e4e6e9";
const HEADER_BG = "#3f444b";

// Column widths (pt); sum = 525 = A4 width minus horizontal padding.
const COL = {
  sn: 22,
  desc: 210,
  qty: 42,
  rate: 68,
  cgst: 62,
  sgst: 62,
  amount: 59,
};

const styles = StyleSheet.create({
  page: {
    fontFamily: "Roboto",
    fontSize: 9,
    color: INK,
    paddingHorizontal: 35,
    paddingVertical: 32,
  },

  header: { flexDirection: "row", justifyContent: "space-between" },
  logo: { width: 96, height: 96, objectFit: "contain" },
  headerRight: { alignItems: "flex-end" },
  docTitle: { fontSize: 22, color: "#2b2f34", letterSpacing: 0.5 },
  invoiceNo: { fontSize: 10, fontWeight: 700, marginTop: 2 },
  balanceLabel: { fontSize: 8, fontWeight: 700, color: MUTED, marginTop: 18 },
  balanceValue: { fontSize: 13, fontWeight: 700, marginTop: 2 },

  seller: { marginTop: 6 },
  partyLabel: {
    fontSize: 7.5,
    fontWeight: 700,
    color: MUTED,
    letterSpacing: 1,
    marginBottom: 3,
  },
  sellerName: { fontSize: 11, fontWeight: 700 },
  sellerLine: { fontSize: 8.5, color: MUTED, marginTop: 1.5 },

  midRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 22 },
  customerName: { fontSize: 10, fontWeight: 700 },
  customerLine: { fontSize: 8.5, color: MUTED, marginTop: 2 },
  supplyBlock: { marginTop: 14 },
  supplyLine: { fontSize: 9, marginTop: 2 },

  metaTable: { width: 235 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2.5 },
  metaLabel: { color: MUTED },
  metaValue: { fontWeight: 700 },

  table: { marginTop: 18 },
  tHead: { flexDirection: "row", backgroundColor: HEADER_BG, paddingVertical: 6, paddingHorizontal: 6 },
  th: { color: "#ffffff", fontSize: 8, fontWeight: 700 },
  tRow: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  td: { fontSize: 8.5 },
  taxSub: { fontSize: 7, color: MUTED, marginTop: 1 },

  totals: { marginTop: 10, flexDirection: "row", justifyContent: "flex-end" },
  totalsBox: { width: 260 },
  totalRow: { flexDirection: "row", paddingVertical: 4, paddingHorizontal: 6 },
  totalLabel: { flex: 1, textAlign: "right", color: MUTED, paddingRight: 14 },
  totalValue: { width: 90, textAlign: "right" },
  grandRow: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderTopWidth: 1,
    borderTopColor: LINE,
  },
  grandLabel: { flex: 1, textAlign: "right", fontWeight: 700, paddingRight: 14 },
  grandValue: { width: 90, textAlign: "right", fontWeight: 700 },
  balanceRow: {
    flexDirection: "row",
    paddingVertical: 7,
    paddingHorizontal: 6,
    backgroundColor: "#f1f2f4",
  },

  words: { flexDirection: "row", justifyContent: "flex-end", marginTop: 10 },
  wordsLabel: { color: MUTED, marginRight: 6 },
  wordsValue: { width: 200, fontWeight: 700, fontStyle: "italic" },

  bank: { marginTop: 40 },
  bankTitle: { fontSize: 9 },
  bankLine: { fontSize: 8.5, color: MUTED, marginTop: 2 },

  footer: {
    position: "absolute",
    bottom: 20,
    left: 35,
    right: 35,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: LINE,
    textAlign: "center",
    fontSize: 7.5,
    color: MUTED,
  },
});

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

export function InvoiceDocument({ data }: { data: InvoiceData }) {
  const totals = computeTotals(data);
  const addressLines = data.seller.address
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  return (
    <Document title={`Invoice ${data.invoiceNumber}`}>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Image src={LOGO_PATH} style={styles.logo} />
          <View style={styles.headerRight}>
            <Text style={styles.docTitle}>TAX INVOICE</Text>
            <Text style={styles.invoiceNo}># {data.invoiceNumber}</Text>
            <Text style={styles.balanceLabel}>Balance Due</Text>
            <Text style={styles.balanceValue}>{formatRupees(totals.total)}</Text>
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

        {/* Customer + invoice meta */}
        <View style={styles.midRow}>
          <View>
            <Text style={styles.partyLabel}>BILL TO</Text>
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
            <MetaRow label="Invoice Date :" value={formatInvoiceDate(data.invoiceDate)} />
            {data.terms ? <MetaRow label="Terms :" value={data.terms} /> : null}
            {data.dueDate ? (
              <MetaRow label="Due Date :" value={formatInvoiceDate(data.dueDate)} />
            ) : null}
          </View>
        </View>

        {/* Line items */}
        <View style={styles.table}>
          <View style={styles.tHead}>
            <Text style={[styles.th, { width: COL.sn }]}>#</Text>
            <Text style={[styles.th, { width: COL.desc }]}>Description</Text>
            <Text style={[styles.th, { width: COL.qty, textAlign: "right" }]}>Qty</Text>
            <Text style={[styles.th, { width: COL.rate, textAlign: "right" }]}>Rate</Text>
            <Text style={[styles.th, { width: COL.cgst, textAlign: "right" }]}>CGST</Text>
            <Text style={[styles.th, { width: COL.sgst, textAlign: "right" }]}>SGST</Text>
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
                <View style={{ width: COL.cgst }}>
                  <Text style={[styles.td, { textAlign: "right" }]}>{formatAmount(amt.cgst)}</Text>
                  <Text style={[styles.taxSub, { textAlign: "right" }]}>{li.cgstRate}%</Text>
                </View>
                <View style={{ width: COL.sgst }}>
                  <Text style={[styles.td, { textAlign: "right" }]}>{formatAmount(amt.sgst)}</Text>
                  <Text style={[styles.taxSub, { textAlign: "right" }]}>{li.sgstRate}%</Text>
                </View>
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
            {totals.cgstGroups.map((g) => (
              <View style={styles.totalRow} key={`c${g.rate}`}>
                <Text style={styles.totalLabel}>CGST ({g.rate}%)</Text>
                <Text style={styles.totalValue}>{formatAmount(g.amount)}</Text>
              </View>
            ))}
            {totals.sgstGroups.map((g) => (
              <View style={styles.totalRow} key={`s${g.rate}`}>
                <Text style={styles.totalLabel}>SGST ({g.rate}%)</Text>
                <Text style={styles.totalValue}>{formatAmount(g.amount)}</Text>
              </View>
            ))}
            <View style={styles.grandRow}>
              <Text style={styles.grandLabel}>Total</Text>
              <Text style={styles.grandValue}>{formatRupees(totals.total)}</Text>
            </View>
            <View style={styles.balanceRow}>
              <Text style={styles.grandLabel}>Balance Due</Text>
              <Text style={styles.grandValue}>{formatRupees(totals.total)}</Text>
            </View>
          </View>
        </View>

        {/* Amount in words */}
        <View style={styles.words}>
          <Text style={styles.wordsLabel}>Total In Words:</Text>
          <Text style={styles.wordsValue}>{amountInWords(totals.total)}</Text>
        </View>

        {/* Bank details */}
        {data.bank &&
        (data.bank.accountName ||
          data.bank.accountNumber ||
          data.bank.accountType ||
          data.bank.ifsc) ? (
          <View style={styles.bank}>
            <Text style={styles.bankTitle}>Please Pay at :</Text>
            {data.bank.accountName ? (
              <Text style={styles.bankLine}>Account Name: {data.bank.accountName}</Text>
            ) : null}
            {data.bank.accountNumber ? (
              <Text style={styles.bankLine}>Account Number: {data.bank.accountNumber}</Text>
            ) : null}
            {data.bank.accountType ? (
              <Text style={styles.bankLine}>Account Type: {data.bank.accountType}</Text>
            ) : null}
            {data.bank.ifsc ? <Text style={styles.bankLine}>IFSC: {data.bank.ifsc}</Text> : null}
          </View>
        ) : null}

        {/* Footer */}
        <Text style={styles.footer} fixed>
          This is a computer-generated invoice and does not require a physical signature.
        </Text>
      </Page>
    </Document>
  );
}
