import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import * as mupdf from "mupdf";
import { InvoiceDocument } from "./InvoiceDocument";
import { ReceiptDocument } from "./ReceiptDocument";
import { amountInWords } from "@/lib/invoice";
import type { InvoiceData, ReceiptData } from "@/types/invoice";

/**
 * Geometry of one text line in PDF user space. y grows downward
 * (MuPDF structured text), matching the page as drawn.
 */
interface Line {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const FOOTER_MARK = "computer-generated";

function seller(): InvoiceData["seller"] {
  return {
    name: "MagickVoice LLP",
    address: "Hyderabad,\nTelangana, India",
    email: "praveen.b@magickvoice.com",
    gstin: "36ACHFM1035C1ZP",
  };
}

/** The 12-line invoice that put the footer through Balance Due. */
function reportedInvoice(): InvoiceData {
  return {
    invoiceNumber: "1793441885898",
    invoiceDate: "2026-11-01",
    dueDate: "2026-11-19",
    terms: "Custom",
    hsnSac: "998314",
    placeOfSupply: "Telangana",
    cgstRate: 9,
    sgstRate: 9,
    seller: seller(),
    customer: {
      name: "Samarthya Financial Services Pvt Ltd",
      gstin: "36ABJCS1117R1ZV",
    },
    lineItems: [
      { description: "[Samarthya Connect] AI Call pulses", quantity: 95948, rate: 4 },
      { description: "[Samarthya Connect] AI Unconnected", quantity: 115603, rate: 0.2 },
      { description: "[Samarthya Connect] IVR unconnected", quantity: 110489, rate: 0.2 },
      { description: "[Samarthya Connect] IVR Connected", quantity: 35527, rate: 2 },
      { description: "[Samarthya Connect] Concurrency", quantity: 50, rate: 1000 },
      { description: "[Samarthya Connect] DID", quantity: 56, rate: 800 },
      { description: "[Magickvoice] AI call pulses", quantity: 5839, rate: 4 },
      { description: "[Magickvoice] AI Unconnected", quantity: 26049, rate: 0.2 },
      { description: "[Magickvoice] IVR Unconnected", quantity: 32284, rate: 0.2 },
      { description: "[Magickvoice] IVR connected", quantity: 6373, rate: 2 },
      { description: "[Magickvoice] Concurrency", quantity: 20, rate: 1000 },
      { description: "[Magickvoice] DID", quantity: 13, rate: 599 },
    ],
    discount: { type: "fixed", value: 300000, description: "Advance credits" },
    bank: {
      accountName: "MAGICKVOICE LLP",
      accountNumber: "0054815490",
      accountType: "Current",
      ifsc: "KKBK0007502",
    },
  };
}

function shortInvoice(lines: number): InvoiceData {
  return {
    ...reportedInvoice(),
    invoiceNumber: `short-${lines}`,
    lineItems: Array.from({ length: lines }, (_, i) => ({
      description: `Consulting day ${i + 1}`,
      quantity: 1,
      rate: 1000,
    })),
    discount: undefined,
  };
}

function reportedReceipt(): ReceiptData {
  const invoice = reportedInvoice();
  return {
    ...invoice,
    receiptNumber: "R-1793441885898",
    payment: {
      method: "Bank Transfer",
      reference: "UTR9988776655",
      paidOn: "2026-11-02",
      amountReceived: 437095.6,
    },
  };
}

function asBBox(raw: unknown): { x0: number; y0: number; x1: number; y1: number } {
  if (Array.isArray(raw) && raw.length === 4) {
    const [a, b, c, d] = raw as number[];
    return { x0: Math.min(a, c), y0: Math.min(b, d), x1: Math.max(a, c), y1: Math.max(b, d) };
  }
  if (raw && typeof raw === "object" && "x" in raw && "w" in raw) {
    const box = raw as { x: number; y: number; w: number; h: number };
    return { x0: box.x, y0: box.y, x1: box.x + box.w, y1: box.y + box.h };
  }
  throw new Error(`Unrecognised text bbox: ${JSON.stringify(raw)}`);
}

async function renderInvoice(data: InvoiceData): Promise<Buffer> {
  return renderToBuffer(createElement(InvoiceDocument, { data }));
}

async function renderReceipt(data: ReceiptData): Promise<Buffer> {
  return renderToBuffer(createElement(ReceiptDocument, { data }));
}

function readPages(pdf: Buffer): Line[][] {
  const doc = mupdf.Document.openDocument(new Uint8Array(pdf), "application/pdf");
  const pages: Line[][] = [];
  for (let i = 0; i < doc.countPages(); i += 1) {
    const page = doc.loadPage(i);
    const structured = JSON.parse(page.toStructuredText("preserve-whitespace").asJSON()) as {
      blocks?: { lines?: { bbox: unknown; text?: string }[] }[];
    };
    const lines: Line[] = [];
    for (const block of structured.blocks ?? []) {
      for (const line of block.lines ?? []) {
        const text = (line.text ?? "").replace(/\s+/g, " ").trim();
        if (!text) continue;
        lines.push({ text, ...asBBox(line.bbox) });
      }
    }
    pages.push(lines);
  }
  return pages;
}

function pageOf(pages: Line[][], needle: string): number {
  return pages.findIndex((lines) => lines.some((line) => line.text.includes(needle)));
}

/**
 * The footer rule sits 8pt above its text. Balance Due's gray bar extends
 * about 7pt below its glyphs. A 20pt gap between those text boxes clears both.
 */
function assertFooterClearsContent(pages: Line[][]) {
  expect(pages.length).toBeGreaterThan(0);
  for (const lines of pages) {
    const footer = lines.find((line) => line.text.includes(FOOTER_MARK));
    expect(footer).toBeTruthy();
    const content = lines.filter((line) => line !== footer);
    expect(content.length).toBeGreaterThan(0);
    const contentBottom = Math.max(...content.map((line) => line.y1));
    expect(contentBottom).toBeLessThanOrEqual(footer!.y0 - 20);
  }
}

function assertSummaryStaysTogether(pages: Line[][], wordsLabel: string, detailsLabel: string) {
  const totalsPage = pageOf(pages, "Sub Total");
  expect(totalsPage).toBeGreaterThanOrEqual(0);
  expect(pageOf(pages, wordsLabel)).toBe(totalsPage);
  expect(pageOf(pages, detailsLabel)).toBe(totalsPage);
  expect(pageOf(pages, "Balance Due")).toBeGreaterThanOrEqual(0);
  const balancePages = pages
    .map((lines, index) => (lines.some((line) => line.text.includes("Balance Due")) ? index : -1))
    .filter((index) => index >= 0);
  expect(balancePages).toContain(totalsPage);
}

describe("invoice PDF layout", () => {
  it("keeps the reported 12-line invoice footer clear of Balance Due", async () => {
    const pages = readPages(await renderInvoice(reportedInvoice()));

    assertFooterClearsContent(pages);
    assertSummaryStaysTogether(pages, "Total In Words", "Please Pay at");

    const phrase = "Indian Rupee Four Lakh Thirty-Seven Thousand Ninety-Five And Sixty Paise Only";
    const wordsPage = pages[pageOf(pages, "Total In Words")];
    const phraseLines = wordsPage.filter(
      (line) => line.text.includes("Indian Rupee") || line.text.includes("Paise Only")
    );
    expect(phraseLines).toHaveLength(1);
    expect(phraseLines[0].text).toContain(phrase);
    expect(phraseLines[0].x1 - phraseLines[0].x0).toBeGreaterThan(300);
  });

  it("still fits a one-line and a two-line invoice on a single page", async () => {
    for (const count of [1, 2]) {
      const pages = readPages(await renderInvoice(shortInvoice(count)));
      expect(pages).toHaveLength(1);
      assertFooterClearsContent(pages);
      assertSummaryStaysTogether(pages, "Total In Words", "Please Pay at");
    }
  });

  it("wraps a crore-scale amount on word boundaries inside a wide box", async () => {
    const data = shortInvoice(1);
    data.cgstRate = 0;
    data.sgstRate = 0;
    data.lineItems = [{ description: "Annual retainer", quantity: 1, rate: 99999999.99 }];
    const phrase = amountInWords(99999999.99);
    const pages = readPages(await renderInvoice(data));
    assertFooterClearsContent(pages);

    const related = pages
      .flat()
      .filter((line) => line.text.includes("Indian Rupee") || line.text.includes("Paise Only") || line.text.includes("Total In Words"));
    const joined = related
      .map((line) => line.text.replace("Total In Words:", "").trim())
      .join(" ")
      .replace(/\s+/g, " ");
    expect(joined).toBe(phrase);
    const widest = Math.max(...related.map((line) => line.x1 - line.x0));
    expect(widest).toBeGreaterThan(300);
    for (const line of related) {
      expect(line.x1).toBeLessThanOrEqual(575);
    }
  });

  it("does not let a long table run into the footer", async () => {
    const data = shortInvoice(36);
    data.discount = undefined;
    const pages = readPages(await renderInvoice(data));
    expect(pages.length).toBeGreaterThan(1);
    assertFooterClearsContent(pages);
    assertSummaryStaysTogether(pages, "Total In Words", "Please Pay at");
  });

  it("keeps a full receipt footer clear of the totals", async () => {
    const pages = readPages(await renderReceipt(reportedReceipt()));
    assertFooterClearsContent(pages);
    assertSummaryStaysTogether(pages, "Received In Words", "Payment Details");

    const short = reportedReceipt();
    short.lineItems = short.lineItems.slice(0, 2);
    short.payment.amountReceived = 2000;
    const shortPages = readPages(await renderReceipt(short));
    expect(shortPages).toHaveLength(1);
    assertFooterClearsContent(shortPages);
    assertSummaryStaysTogether(shortPages, "Received In Words", "Payment Details");
  });
});
