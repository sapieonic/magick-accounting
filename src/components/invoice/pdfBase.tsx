import path from "path";
import { View, Text, StyleSheet, Font } from "@react-pdf/renderer";

// Roboto is registered because the default PDF font (Helvetica) has no rupee
// glyph (₹). Files live in public/invoice/ so they ship with every deployment.
export const ASSET_DIR = path.join(process.cwd(), "public", "invoice");

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

export const LOGO_PATH = path.join(ASSET_DIR, "logo.png");

export const INK = "#33373d";
export const MUTED = "#7b8087";
export const LINE = "#e4e6e9";
export const HEADER_BG = "#3f444b";
export const PAID_GREEN = "#1f9d57";

// Column widths (pt); sum = 525 = A4 width minus horizontal padding.
export const COL = {
  sn: 22,
  desc: 268,
  qty: 50,
  rate: 90,
  amount: 95,
};

// Shared between the invoice and receipt PDF templates. Receipt-only entries
// (paidBadge, payment*) are ignored by the invoice document.
export const styles = StyleSheet.create({
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

  paidBadge: {
    marginTop: 10,
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderWidth: 1.5,
    borderColor: PAID_GREEN,
    borderRadius: 4,
  },
  paidBadgeText: { fontSize: 12, fontWeight: 700, color: PAID_GREEN, letterSpacing: 2 },

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
  receivedRow: {
    flexDirection: "row",
    paddingVertical: 7,
    paddingHorizontal: 6,
    backgroundColor: "#e9f6ef",
  },

  words: { flexDirection: "row", justifyContent: "flex-end", marginTop: 10 },
  wordsLabel: { color: MUTED, marginRight: 6 },
  wordsValue: { width: 200, fontWeight: 700, fontStyle: "italic" },

  bank: { marginTop: 40 },
  bankTitle: { fontSize: 9 },
  bankLine: { fontSize: 8.5, color: MUTED, marginTop: 2 },

  payment: { marginTop: 40 },
  paymentTitle: { fontSize: 9, fontWeight: 700 },
  paymentLine: { fontSize: 8.5, color: MUTED, marginTop: 2 },

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

export function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}
