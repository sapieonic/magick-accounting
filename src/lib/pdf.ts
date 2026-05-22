import * as mupdf from "mupdf";

/**
 * Rasterizes the first page of a PDF to a PNG image.
 * Used so PDF receipts can be sent to the (image-only) vision model.
 */
export function renderPdfFirstPageToPng(pdf: Buffer): Buffer {
  const doc = mupdf.Document.openDocument(new Uint8Array(pdf), "application/pdf");
  if (doc.countPages() < 1) {
    throw new Error("The PDF has no pages");
  }

  const page = doc.loadPage(0);
  // 2x scale keeps small receipt text legible for the model.
  const pixmap = page.toPixmap(
    mupdf.Matrix.scale(2, 2),
    mupdf.ColorSpace.DeviceRGB,
    false
  );

  return Buffer.from(pixmap.asPNG());
}
