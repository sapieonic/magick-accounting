import { describe, it, expect } from "vitest";
import {
  lineItemAmount,
  computeTotals,
  formatAmount,
  formatDiscountLabel,
  formatRupees,
  formatInvoiceDate,
  amountInWords,
  parseInvoice,
} from "@/lib/invoice";
import type { InvoiceData } from "@/types/invoice";

function makeInvoice(overrides: Partial<InvoiceData> = {}): InvoiceData {
  return {
    invoiceNumber: "1",
    invoiceDate: "2024-01-01",
    cgstRate: 9,
    sgstRate: 9,
    seller: { name: "S", address: "A", email: "e", gstin: "G" },
    customer: { name: "C", gstin: "G2" },
    lineItems: [],
    ...overrides,
  };
}

describe("lineItemAmount", () => {
  it("multiplies quantity by rate", () => {
    expect(lineItemAmount(3, 100)).toBe(300);
  });

  it("rounds to 2 decimal places", () => {
    expect(lineItemAmount(3, 33.333)).toBe(100); // 99.999 -> 100.00
    expect(lineItemAmount(1, 1.005)).toBeCloseTo(1.01, 2);
  });

  it("treats NaN/undefined operands as 0", () => {
    expect(lineItemAmount(NaN, 100)).toBe(0);
    expect(lineItemAmount(undefined as unknown as number, 100)).toBe(0);
    expect(lineItemAmount(5, undefined as unknown as number)).toBe(0);
  });

  it("handles zero", () => {
    expect(lineItemAmount(0, 100)).toBe(0);
  });
});

describe("computeTotals", () => {
  it("computes subtotal, CGST/SGST and total", () => {
    const totals = computeTotals(
      makeInvoice({
        cgstRate: 9,
        sgstRate: 9,
        lineItems: [
          { description: "a", quantity: 2, rate: 100 },
          { description: "b", quantity: 1, rate: 50 },
        ],
      })
    );
    expect(totals.subTotal).toBe(250);
    expect(totals.cgstAmount).toBe(22.5);
    expect(totals.sgstAmount).toBe(22.5);
    expect(totals.total).toBe(295);
    expect(totals.perItem).toEqual([{ amount: 200 }, { amount: 50 }]);
  });

  it("clamps negative rates to 0", () => {
    const totals = computeTotals(
      makeInvoice({
        cgstRate: -5,
        sgstRate: -10,
        lineItems: [{ description: "a", quantity: 1, rate: 100 }],
      })
    );
    expect(totals.cgstRate).toBe(0);
    expect(totals.sgstRate).toBe(0);
    expect(totals.cgstAmount).toBe(0);
    expect(totals.sgstAmount).toBe(0);
    expect(totals.total).toBe(100);
  });

  it("treats NaN rates as 0", () => {
    const totals = computeTotals(
      makeInvoice({
        cgstRate: NaN as unknown as number,
        sgstRate: NaN as unknown as number,
        lineItems: [{ description: "a", quantity: 1, rate: 100 }],
      })
    );
    expect(totals.cgstRate).toBe(0);
    expect(totals.sgstRate).toBe(0);
  });

  it("rounds amounts to 2 decimal places", () => {
    const totals = computeTotals(
      makeInvoice({
        cgstRate: 9,
        sgstRate: 9,
        lineItems: [{ description: "a", quantity: 1, rate: 99.99 }],
      })
    );
    expect(totals.subTotal).toBe(99.99);
    expect(totals.cgstAmount).toBe(9); // 8.9991 -> 9.00
    expect(totals.sgstAmount).toBe(9);
    expect(totals.total).toBe(117.99);
  });

  it("handles an empty line items list", () => {
    const totals = computeTotals(makeInvoice({ lineItems: [] }));
    expect(totals.subTotal).toBe(0);
    expect(totals.discountAmount).toBe(0);
    expect(totals.taxableAmount).toBe(0);
    expect(totals.total).toBe(0);
    expect(totals.perItem).toEqual([]);
  });

  it("leaves taxable amount equal to subtotal when there is no discount", () => {
    const totals = computeTotals(
      makeInvoice({
        lineItems: [{ description: "a", quantity: 1, rate: 100 }],
      })
    );
    expect(totals.discountAmount).toBe(0);
    expect(totals.taxableAmount).toBe(100);
  });

  it("applies a percentage discount before GST", () => {
    const totals = computeTotals(
      makeInvoice({
        cgstRate: 9,
        sgstRate: 9,
        discount: { type: "percentage", value: 10 },
        lineItems: [{ description: "a", quantity: 1, rate: 1000 }],
      })
    );
    expect(totals.subTotal).toBe(1000);
    expect(totals.discountAmount).toBe(100);
    expect(totals.taxableAmount).toBe(900);
    expect(totals.cgstAmount).toBe(81);
    expect(totals.sgstAmount).toBe(81);
    expect(totals.total).toBe(1062);
  });

  it("applies a fixed discount before GST", () => {
    const totals = computeTotals(
      makeInvoice({
        cgstRate: 9,
        sgstRate: 9,
        discount: { type: "fixed", value: 50 },
        lineItems: [
          { description: "a", quantity: 2, rate: 100 },
          { description: "b", quantity: 1, rate: 50 },
        ],
      })
    );
    expect(totals.subTotal).toBe(250);
    expect(totals.discountAmount).toBe(50);
    expect(totals.taxableAmount).toBe(200);
    expect(totals.cgstAmount).toBe(18);
    expect(totals.sgstAmount).toBe(18);
    expect(totals.total).toBe(236);
  });

  it("caps a percentage discount at 100%", () => {
    const totals = computeTotals(
      makeInvoice({
        cgstRate: 9,
        sgstRate: 9,
        discount: { type: "percentage", value: 150 },
        lineItems: [{ description: "a", quantity: 1, rate: 100 }],
      })
    );
    expect(totals.discountAmount).toBe(100);
    expect(totals.taxableAmount).toBe(0);
    expect(totals.cgstAmount).toBe(0);
    expect(totals.total).toBe(0);
  });

  it("caps a fixed discount at the sub-total", () => {
    const totals = computeTotals(
      makeInvoice({
        discount: { type: "fixed", value: 9999 },
        lineItems: [{ description: "a", quantity: 1, rate: 80 }],
      })
    );
    expect(totals.discountAmount).toBe(80);
    expect(totals.taxableAmount).toBe(0);
    expect(totals.total).toBe(0);
  });
});

describe("formatDiscountLabel", () => {
  it("returns empty when there is no discount amount", () => {
    expect(formatDiscountLabel(makeInvoice(), 0)).toBe("");
  });

  it("includes the percentage when there is no description", () => {
    expect(
      formatDiscountLabel(makeInvoice({ discount: { type: "percentage", value: 10 } }), 100)
    ).toBe("Discount (10%)");
  });

  it("includes description and percentage together", () => {
    expect(
      formatDiscountLabel(
        makeInvoice({
          discount: { type: "percentage", value: 10, description: "Early payment" },
        }),
        100
      )
    ).toBe("Discount (Early payment, 10%)");
  });

  it("uses the description for a fixed discount", () => {
    expect(
      formatDiscountLabel(
        makeInvoice({ discount: { type: "fixed", value: 50, description: "Loyalty" } }),
        50
      )
    ).toBe("Discount (Loyalty)");
  });

  it("falls back to Discount for a plain fixed amount", () => {
    expect(
      formatDiscountLabel(makeInvoice({ discount: { type: "fixed", value: 50 } }), 50)
    ).toBe("Discount");
  });
});

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    invoiceNumber: "INV-1",
    invoiceDate: "2024-01-01",
    cgstRate: 9,
    sgstRate: 9,
    seller: { name: "Seller" },
    customer: { name: "Customer" },
    lineItems: [{ description: "Widget", quantity: 1, rate: 100 }],
    ...overrides,
  };
}

describe("parseInvoice", () => {
  it("parses a percentage discount with a description", () => {
    const parsed = parseInvoice(
      validBody({
        discount: { type: "percentage", value: 12.5, description: "  Early payment  " },
      })
    );
    expect(parsed).toMatchObject({
      discount: { type: "percentage", value: 12.5, description: "Early payment" },
    });
  });

  it("parses a fixed discount", () => {
    const parsed = parseInvoice(validBody({ discount: { type: "fixed", value: 75 } }));
    expect(parsed).toMatchObject({
      discount: { type: "fixed", value: 75 },
    });
    if (typeof parsed !== "string") {
      expect(parsed.discount).not.toHaveProperty("description");
    }
  });

  it("omits an invalid or empty discount", () => {
    for (const discount of [
      { type: "bogus", value: 10 },
      { type: "percentage", value: 0 },
      { type: "fixed", value: -20 },
      undefined,
    ]) {
      const parsed = parseInvoice(
        discount === undefined ? validBody() : validBody({ discount })
      );
      expect(parsed).not.toBeTypeOf("string");
      expect(parsed).not.toHaveProperty("discount");
    }
  });
});

describe("formatAmount", () => {
  it("uses Indian digit grouping with 2 decimals", () => {
    expect(formatAmount(123456)).toBe("1,23,456.00");
  });

  it("formats small numbers", () => {
    expect(formatAmount(0)).toBe("0.00");
    expect(formatAmount(99.5)).toBe("99.50");
  });

  it("treats NaN as 0", () => {
    expect(formatAmount(NaN)).toBe("0.00");
  });
});

describe("formatRupees", () => {
  it("prefixes the rupee symbol", () => {
    expect(formatRupees(41241)).toBe("₹41,241.00");
  });

  it("handles zero", () => {
    expect(formatRupees(0)).toBe("₹0.00");
  });
});

describe("formatInvoiceDate", () => {
  it("converts YYYY-MM-DD to DD/MM/YYYY", () => {
    expect(formatInvoiceDate("2024-01-15")).toBe("15/01/2024");
  });

  it("passes through invalid formats unchanged", () => {
    expect(formatInvoiceDate("15/01/2024")).toBe("15/01/2024");
    expect(formatInvoiceDate("not-a-date")).toBe("not-a-date");
    expect(formatInvoiceDate("")).toBe("");
  });
});

describe("amountInWords", () => {
  it("renders zero", () => {
    expect(amountInWords(0)).toBe("Indian Rupee Zero Only");
  });

  it("renders ones and hyphenated tens", () => {
    expect(amountInWords(5)).toBe("Indian Rupee Five Only");
    expect(amountInWords(41)).toBe("Indian Rupee Forty-One Only");
    expect(amountInWords(20)).toBe("Indian Rupee Twenty Only");
    expect(amountInWords(19)).toBe("Indian Rupee Nineteen Only");
  });

  it("renders hundreds", () => {
    expect(amountInWords(100)).toBe("Indian Rupee One Hundred Only");
    expect(amountInWords(241)).toBe("Indian Rupee Two Hundred Forty-One Only");
  });

  it("renders thousand, lakh and crore (Indian system)", () => {
    expect(amountInWords(1000)).toBe("Indian Rupee One Thousand Only");
    expect(amountInWords(41241)).toBe(
      "Indian Rupee Forty-One Thousand Two Hundred Forty-One Only"
    );
    expect(amountInWords(100000)).toBe("Indian Rupee One Lakh Only");
    expect(amountInWords(10000000)).toBe("Indian Rupee One Crore Only");
    expect(amountInWords(12345678)).toBe(
      "Indian Rupee One Crore Twenty-Three Lakh Forty-Five Thousand Six Hundred Seventy-Eight Only"
    );
  });

  it("renders paise", () => {
    expect(amountInWords(41.5)).toBe("Indian Rupee Forty-One And Fifty Paise Only");
    expect(amountInWords(0.01)).toBe("Indian Rupee Zero And One Paise Only");
    expect(amountInWords(100.25)).toBe(
      "Indian Rupee One Hundred And Twenty-Five Paise Only"
    );
  });

  it("clamps negative amounts to zero", () => {
    expect(amountInWords(-500)).toBe("Indian Rupee Zero Only");
  });

  it("treats NaN as zero", () => {
    expect(amountInWords(NaN)).toBe("Indian Rupee Zero Only");
  });
});
