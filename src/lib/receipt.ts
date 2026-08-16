export function assertReceiptOwnedByUser(receiptKey: unknown, userId: string): void {
  if (receiptKey == null || receiptKey === "") return;
  if (typeof receiptKey !== "string" || !receiptKey.startsWith(`receipts/${userId}/`)) {
    throw new Error("Receipt must be an upload owned by the current user");
  }
}
