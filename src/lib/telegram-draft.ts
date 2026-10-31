import { format, parseISO } from "date-fns";
import { formatCurrency } from "@/lib/currency";
import { escapeHtml, type InlineKeyboard, type InlineKeyboardButton } from "@/lib/telegram";

// Pure helpers for the Telegram expense draft: which step it is on, the card
// the bot shows for it, and the inline-button payloads. No DB or network here.

export type DraftStep = "amount" | "category" | "department" | "confirm";

export interface DraftSnapshot {
  id: string;
  title: string;
  amount: number | null;
  gstAmount: number | null;
  currencyCode: string;
  date: string;
  description: string;
  categoryName: string | null;
  departmentName: string | null;
  paymentSource: "pocket" | "company";
  receiptFilename: string | null;
}

export interface DraftOption {
  id: string;
  name: string;
}

export interface DraftCard {
  html: string;
  keyboard: InlineKeyboard;
}

/** The first missing required field, or "confirm" when the draft can be saved. */
export function draftStep(draft: Pick<DraftSnapshot, "amount" | "categoryName" | "departmentName">): DraftStep {
  if (draft.amount == null) return "amount";
  if (!draft.categoryName) return "category";
  if (!draft.departmentName) return "department";
  return "confirm";
}

// --- Inline button payloads (Telegram caps callback_data at 64 bytes) ---

export type DraftAction =
  | { type: "save"; draftId: string }
  | { type: "discard"; draftId: string }
  | { type: "category"; draftId: string; value: string }
  | { type: "department"; draftId: string; value: string }
  | { type: "changeCategory"; draftId: string }
  | { type: "changeDepartment"; draftId: string }
  | { type: "togglePayment"; draftId: string };

const ACTION_CODES = {
  save: "s",
  discard: "x",
  category: "c",
  department: "d",
  changeCategory: "cc",
  changeDepartment: "cd",
  togglePayment: "p",
} as const satisfies Record<DraftAction["type"], string>;

const OBJECT_ID = /^[a-f0-9]{24}$/i;

export function encodeDraftAction(action: DraftAction): string {
  const code = ACTION_CODES[action.type];
  return "value" in action ? `${code}:${action.draftId}:${action.value}` : `${code}:${action.draftId}`;
}

export function parseDraftAction(data: string | undefined): DraftAction | null {
  if (!data) return null;
  const [code, draftId, value, ...rest] = data.split(":");
  if (rest.length || !OBJECT_ID.test(draftId ?? "")) return null;
  const type = (Object.keys(ACTION_CODES) as DraftAction["type"][]).find(
    (key) => ACTION_CODES[key] === code
  );
  if (!type) return null;
  if (type === "category" || type === "department") {
    return OBJECT_ID.test(value ?? "") ? { type, draftId, value } : null;
  }
  return value === undefined ? ({ type, draftId } as DraftAction) : null;
}

/**
 * Reads a typed amount such as "1250", "1,250.50", "₹ 450" or "Rs. 99.9".
 * Returns null for anything that isn't a single non-negative amount.
 */
export function parseAmountReply(text: string): number | null {
  const cleaned = text
    .trim()
    .replace(/^(rs\.?|inr|₹|\$|€|£)\s*/i, "")
    .replace(/\s*(rs\.?|inr|₹|\/-)$/i, "")
    .replace(/[,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const amount = Number(cleaned);
  return Number.isFinite(amount) ? amount : null;
}

// --- Rendering ---

function formatDate(date: string): string {
  try {
    return format(parseISO(date), "d MMM yyyy");
  } catch {
    return date;
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function summaryLines(draft: DraftSnapshot): string[] {
  const lines = [`🧾 <b>${escapeHtml(draft.title || "Untitled expense")}</b>`];
  if (draft.amount != null) {
    const gst =
      draft.gstAmount != null && draft.gstAmount > 0
        ? ` (incl. GST ${escapeHtml(formatCurrency(draft.gstAmount, draft.currencyCode))})`
        : "";
    lines.push(`💰 ${escapeHtml(formatCurrency(draft.amount, draft.currencyCode))}${gst}`);
  } else {
    lines.push("💰 <i>amount needed</i>");
  }
  lines.push(`📅 ${escapeHtml(formatDate(draft.date))}`);
  lines.push(`🏷 ${draft.categoryName ? escapeHtml(draft.categoryName) : "<i>category needed</i>"}`);
  lines.push(`🏢 ${draft.departmentName ? escapeHtml(draft.departmentName) : "<i>department needed</i>"}`);
  lines.push(`💳 ${draft.paymentSource === "company" ? "Paid by the company" : "Paid by me (reimbursable)"}`);
  if (draft.receiptFilename) lines.push(`📎 ${escapeHtml(truncate(draft.receiptFilename, 60))}`);
  if (draft.description) lines.push("", `<i>${escapeHtml(truncate(draft.description, 300))}</i>`);
  return lines;
}

function optionRows(
  options: DraftOption[],
  toAction: (id: string) => DraftAction
): InlineKeyboardButton[][] {
  const rows: InlineKeyboardButton[][] = [];
  // Keep the keyboard a manageable size; Telegram rejects very large ones.
  options.slice(0, 60).forEach((option, index) => {
    const button = { text: truncate(option.name, 30), callback_data: encodeDraftAction(toAction(option.id)) };
    if (index % 2 === 0) rows.push([button]);
    else rows[rows.length - 1].push(button);
  });
  return rows;
}

export function renderDraftCard(
  draft: DraftSnapshot,
  options: { categories: DraftOption[]; departments: DraftOption[] }
): DraftCard {
  const draftId = draft.id;
  const discard: InlineKeyboardButton = {
    text: "❌ Discard",
    callback_data: encodeDraftAction({ type: "discard", draftId }),
  };
  const lines = summaryLines(draft);
  const step = draftStep(draft);

  if (step === "amount") {
    return {
      html: [...lines, "", "How much was it? <b>Reply with the total amount</b>, e.g. <code>1250.50</code>."].join("\n"),
      keyboard: [[discard]],
    };
  }
  if (step === "category") {
    return {
      html: [...lines, "", "Pick a <b>category</b>:"].join("\n"),
      keyboard: [
        ...optionRows(options.categories, (value) => ({ type: "category", draftId, value })),
        [discard],
      ],
    };
  }
  if (step === "department") {
    return {
      html: [...lines, "", "Pick a <b>department</b>:"].join("\n"),
      keyboard: [
        ...optionRows(options.departments, (value) => ({ type: "department", draftId, value })),
        [discard],
      ],
    };
  }
  return {
    html: [...lines, "", "Save this expense?"].join("\n"),
    keyboard: [
      [{ text: "✅ Save expense", callback_data: encodeDraftAction({ type: "save", draftId }) }],
      [
        { text: "🏷 Category", callback_data: encodeDraftAction({ type: "changeCategory", draftId }) },
        { text: "🏢 Department", callback_data: encodeDraftAction({ type: "changeDepartment", draftId }) },
      ],
      [
        {
          text: draft.paymentSource === "company" ? "💳 Paid by me instead" : "💳 Company paid instead",
          callback_data: encodeDraftAction({ type: "togglePayment", draftId }),
        },
      ],
      [discard],
    ],
  };
}

export function renderSavedCard(draft: DraftSnapshot, expenseUrl: string | null): DraftCard {
  return {
    html: ["✅ <b>Expense saved</b>", "", ...summaryLines(draft)].join("\n"),
    keyboard: expenseUrl ? [[{ text: "Open in Magick Accounting", url: expenseUrl }]] : [],
  };
}

export function renderDiscardedCard(draft: DraftSnapshot): DraftCard {
  return {
    html: [`🗑 <s>${escapeHtml(draft.title || "Untitled expense")}</s> — discarded.`].join("\n"),
    keyboard: [],
  };
}
