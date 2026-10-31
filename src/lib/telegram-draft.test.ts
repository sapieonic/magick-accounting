import { describe, expect, it } from "vitest";
import {
  draftStep,
  encodeDraftAction,
  parseAmountReply,
  parseDraftAction,
  renderDraftCard,
  renderSavedCard,
  type DraftSnapshot,
} from "./telegram-draft";

const DRAFT = "66c1884c0853f8a76a4da201";
const CATEGORY = "66c1884c0853f8a76a4da301";

const snapshot = (overrides: Partial<DraftSnapshot> = {}): DraftSnapshot => ({
  id: DRAFT,
  title: "Uber <airport>",
  amount: 450,
  gstAmount: 21.43,
  currencyCode: "INR",
  date: "2026-10-30",
  description: "Ride to BLR",
  categoryName: "Travel",
  departmentName: "Engineering",
  paymentSource: "pocket",
  receiptFilename: "receipt.pdf",
  ...overrides,
});

describe("draftStep", () => {
  it("asks for the amount, then the category, then the department", () => {
    expect(draftStep({ amount: null, categoryName: null, departmentName: null })).toBe("amount");
    expect(draftStep({ amount: 0, categoryName: null, departmentName: null })).toBe("category");
    expect(draftStep({ amount: 10, categoryName: "Travel", departmentName: null })).toBe("department");
    expect(draftStep({ amount: 10, categoryName: "Travel", departmentName: "Eng" })).toBe("confirm");
  });
});

describe("draft actions", () => {
  it("round-trips every action within Telegram's 64-byte limit", () => {
    const actions = [
      { type: "save", draftId: DRAFT },
      { type: "discard", draftId: DRAFT },
      { type: "category", draftId: DRAFT, value: CATEGORY },
      { type: "department", draftId: DRAFT, value: CATEGORY },
      { type: "changeCategory", draftId: DRAFT },
      { type: "changeDepartment", draftId: DRAFT },
      { type: "togglePayment", draftId: DRAFT },
    ] as const;
    for (const action of actions) {
      const data = encodeDraftAction(action);
      expect(Buffer.byteLength(data)).toBeLessThanOrEqual(64);
      expect(parseDraftAction(data)).toEqual(action);
    }
  });

  it("rejects malformed or tampered payloads", () => {
    expect(parseDraftAction(undefined)).toBeNull();
    expect(parseDraftAction("s:not-an-id")).toBeNull();
    expect(parseDraftAction(`zz:${DRAFT}`)).toBeNull();
    expect(parseDraftAction(`c:${DRAFT}`)).toBeNull();
    expect(parseDraftAction(`c:${DRAFT}:{"$ne":1}`)).toBeNull();
    expect(parseDraftAction(`s:${DRAFT}:${CATEGORY}`)).toBeNull();
  });
});

describe("parseAmountReply", () => {
  it.each([
    ["1250", 1250],
    ["1,250.50", 1250.5],
    ["₹ 450", 450],
    ["Rs. 99.9", 99.9],
    ["450/-", 450],
    ["0", 0],
  ])("reads %s", (input, expected) => {
    expect(parseAmountReply(input)).toBe(expected);
  });

  it.each(["", "abc", "-5", "12.345", "1 2 3 four", "450 for lunch"])("rejects %s", (input) => {
    expect(parseAmountReply(input)).toBeNull();
  });
});

describe("renderDraftCard", () => {
  const options = {
    categories: [
      { id: CATEGORY, name: "Travel" },
      { id: "66c1884c0853f8a76a4da302", name: "Meals" },
      { id: "66c1884c0853f8a76a4da303", name: "Software" },
    ],
    departments: [{ id: "66c1884c0853f8a76a4da401", name: "Engineering" }],
  };

  it("escapes user-controlled text in the HTML", () => {
    const card = renderDraftCard(snapshot(), options);
    expect(card.html).toContain("Uber &lt;airport&gt;");
    expect(card.html).not.toContain("<airport>");
  });

  it("asks for a typed amount when none was read", () => {
    const card = renderDraftCard(snapshot({ amount: null }), options);
    expect(card.html).toContain("Reply with the total amount");
    expect(card.keyboard.flat().map((b) => b.text)).toEqual(["❌ Discard"]);
  });

  it("lays category choices out two per row", () => {
    const card = renderDraftCard(snapshot({ categoryName: null }), options);
    expect(card.keyboard.map((row) => row.map((b) => b.text))).toEqual([
      ["Travel", "Meals"],
      ["Software"],
      ["❌ Discard"],
    ]);
    expect(parseDraftAction(card.keyboard[0][0].callback_data)).toEqual({
      type: "category",
      draftId: DRAFT,
      value: CATEGORY,
    });
  });

  it("offers save, changes and the payer toggle once complete", () => {
    const card = renderDraftCard(snapshot(), options);
    expect(card.html).toContain("Paid by me (reimbursable)");
    expect(card.html).toContain("incl. GST");
    const texts = card.keyboard.flat().map((b) => b.text);
    expect(texts).toContain("✅ Save expense");
    expect(texts).toContain("💳 Company paid instead");
  });

  it("links the saved expense", () => {
    const card = renderSavedCard(snapshot(), "https://app.example.com/dashboard/expenses/1/edit");
    expect(card.html).toContain("Expense saved");
    expect(card.keyboard[0][0].url).toBe("https://app.example.com/dashboard/expenses/1/edit");
  });
});
