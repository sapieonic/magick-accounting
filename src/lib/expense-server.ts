import User from "@/models/User";
import type { PaymentEntry, PaymentSplit } from "@/lib/expense";

/**
 * Matches an expense still at `revision` of its edit revision
 * (`assetAllocationRevision`), for compare-and-swap writes. Documents that
 * predate the field are at revision 0.
 */
export function revisionMatch(revision: number): Record<string, unknown> {
  return revision === 0
    ? { $or: [{ assetAllocationRevision: 0 }, { assetAllocationRevision: { $exists: false } }] }
    : { assetAllocationRevision: revision };
}

/** Rejects a payment shared between people that names someone who isn't a user. */
export async function assertPayersExist(split: PaymentSplit): Promise<void> {
  if (!split.payments?.length) return;
  const payerIds = [...new Set(split.payments.map((entry) => entry.paidBy))];
  const found = await User.countDocuments({ _id: { $in: payerIds } });
  if (found !== payerIds.length) throw new Error("A payer is not a user of this app");
}

/** Reads a stored expense's payments back into the shape the form and API send. */
export function storedPaymentEntries(
  payments: { paidBy: unknown; amount: number; source: PaymentEntry["source"] }[] | undefined
): PaymentEntry[] {
  return (payments ?? []).map((entry) => ({
    paidBy: String(entry.paidBy),
    amount: entry.amount,
    source: entry.source,
  }));
}
