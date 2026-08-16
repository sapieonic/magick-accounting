import { describe, expect, it } from "vitest";
import { assertReceiptOwnedByUser } from "@/lib/receipt";

describe("assertReceiptOwnedByUser", () => {
  it("accepts no receipt and the current user's upload prefix", () => {
    expect(() => assertReceiptOwnedByUser(null, "user-1")).not.toThrow();
    expect(() =>
      assertReceiptOwnedByUser("receipts/user-1/receipt.pdf", "user-1")
    ).not.toThrow();
  });

  it("rejects another user's key and prefix-confusion keys", () => {
    expect(() =>
      assertReceiptOwnedByUser("receipts/user-2/receipt.pdf", "user-1")
    ).toThrow(/owned by the current user/i);
    expect(() =>
      assertReceiptOwnedByUser("receipts/user-1-malicious/receipt.pdf", "user-1")
    ).toThrow(/owned by the current user/i);
  });
});
