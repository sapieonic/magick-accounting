/**
 * GST is the tax portion *included* in an expense's total `amount` (a receipt
 * total already contains its GST). It is therefore a component of the total and
 * must sit between 0 and the amount, inclusive.
 *
 * Normalizes a raw GST value (from a form or the AI extractor) against the
 * expense total. Returns the cleaned number, or `null` when GST is absent.
 * Throws with a user-facing message when the value is present but invalid.
 */
export function normalizeGstAmount(raw: unknown, amount: number): number | null {
  if (raw === null || raw === undefined || raw === "") return null;

  const gst = Number(raw);
  if (!Number.isFinite(gst) || gst < 0) {
    throw new Error("GST amount must be a valid non-negative number");
  }
  if (Number.isFinite(amount) && gst > amount) {
    throw new Error("GST amount cannot exceed the total amount");
  }
  return gst;
}
