import { describe, expect, it } from "vitest";
import {
  draftStep,
  encodeDraftAction,
  encodeLinkConfirm,
  LINK_CANCEL,
  MAX_OPTION_BUTTONS,
  parseLinkConfirm,
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
    ["1250", 1250, null],
    ["1,250.50", 1250.5, null],
    ["₹ 450", 450, "INR"],
    ["₹450", 450, "INR"],
    ["Rs. 99.9", 99.9, "INR"],
    ["450/-", 450, null],
    ["0", 0, null],
    ["$50", 50, "USD"],
    ["120 AED", 120, "AED"],
    ["usd 12.5", 12.5, "USD"],
    [".5", null, null],
  ])("reads amount reply #%#", (input, amount, currencyCode) => {
    if (amount === null) {
      expect(parseAmountReply(input)).toBeNull();
      return;
    }
    expect(parseAmountReply(input)).toEqual({ amount, currencyCode });
  });

  it.each(["", "abc", "-5", "12.345", "1 2 3 four", "450 for lunch", "$50 USD", "Lunch 450", "hi"])(
    "rejects %s",
    (input) => {
      expect(parseAmountReply(input)).toBeNull();
    }
  );
});

describe("link confirmation payloads", () => {
  it("round-trips a link code and rejects anything else", () => {
    const code = "AbC_123-xyzAbC_123-xyz12";
    expect(Buffer.byteLength(encodeLinkConfirm(code))).toBeLessThanOrEqual(64);
    expect(parseLinkConfirm(encodeLinkConfirm(code))).toBe(code);
    expect(parseLinkConfirm(LINK_CANCEL)).toBeNull();
    expect(parseLinkConfirm("lk:")).toBeNull();
    expect(parseLinkConfirm("lk:bad code")).toBeNull();
    expect(parseLinkConfirm(undefined)).toBeNull();
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

  it("says when there is nothing to pick", () => {
    const card = renderDraftCard(snapshot({ categoryName: null }), { ...options, categories: [] });
    expect(card.html).toContain("There are no categories yet");
    expect(card.keyboard.flat().map((b) => b.text)).toEqual(["❌ Discard"]);
  });

  it("caps very long lists inside Telegram's button limit and says so", () => {
    const many = Array.from({ length: 120 }, (_, i) => ({
      id: (0x66c1884c0853f8a76a4d0000n + BigInt(i)).toString(16).padStart(24, "0"),
      name: `Dept ${i}`,
    }));
    const card = renderDraftCard(snapshot({ departmentName: null }), { ...options, departments: many });
    expect(card.keyboard.flat()).toHaveLength(MAX_OPTION_BUTTONS + 1);
    expect(card.html).toContain(`Showing the first ${MAX_OPTION_BUTTONS} departments`);
  });

  it("offers save, changes and the payer toggle once complete", () => {
    const card = renderDraftCard(snapshot(), options);
    expect(card.html).toContain("Paid by me (reimbursable)");
    expect(card.html).toContain("incl. GST");
    const texts = card.keyboard.flat().map((b) => b.text);
    expect(texts).toContain("✅ Save expense");
    expect(texts).toContain("💳 Company paid instead");
    expect(card.html).toContain("Reply to this message with the right one");
  });

  it("links the saved expense", () => {
    const card = renderSavedCard(snapshot(), "https://app.example.com/dashboard/expenses/1/edit");
    expect(card.html).toContain("Expense saved");
    expect(card.keyboard[0][0].url).toBe("https://app.example.com/dashboard/expenses/1/edit");
  });
});
