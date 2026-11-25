import type { AuthUser } from "@/lib/auth";
import type { ReviewAction } from "@/lib/approval";
import { formatCurrency } from "@/lib/currency";
import { escapeHtml, sendMessage, type InlineKeyboard } from "@/lib/telegram";
import { getConnectedBot } from "@/lib/telegram-server";
import Currency from "@/models/Currency";
import User from "@/models/User";

// Best-effort Telegram notice to submitters after an admin approves or rejects
// their expenses. Sent only after the decision is committed; a failure here
// is logged and never affects the response.

/** An expense as a review returns it; refs may or may not be populated. */
export interface ReviewedExpense {
  _id: unknown;
  title?: string;
  amount?: number;
  currency?: unknown;
  createdBy?: unknown;
}

export interface ReviewNoticeItem {
  id: string;
  title: string;
  amount: string;
}

/** Most expenses one notice lists by name. */
const NOTICE_LIST_LIMIT = 10;

function refId(value: unknown): string {
  if (value && typeof value === "object" && "_id" in value) {
    return String((value as { _id: unknown })._id);
  }
  return String(value ?? "");
}

function populatedCode(value: unknown): string | null {
  if (value && typeof value === "object" && "code" in value) {
    const code = (value as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
  }
  return null;
}

/** The message one submitter gets about one decision on one or more of their expenses. */
export function renderReviewNotice(args: {
  action: ReviewAction;
  items: ReviewNoticeItem[];
  reason: string | null;
  reviewerName: string;
  appUrl: string;
}): { html: string; keyboard: InlineKeyboard } {
  const { action, items, reason, reviewerName, appUrl } = args;
  const single = items.length === 1;
  const approved = action === "approve";
  const lines: string[] = [];
  const noun = single ? "Expense" : `${items.length} expenses`;
  lines.push(approved ? `✅ <b>${noun} approved</b>` : `❌ <b>${noun} rejected</b>`);
  lines.push("");
  const listed = items.slice(0, NOTICE_LIST_LIMIT);
  for (const item of listed) {
    lines.push(`${single ? "🧾" : "•"} ${escapeHtml(item.title)} · ${escapeHtml(item.amount)}`);
  }
  if (items.length > listed.length) lines.push(`…and ${items.length - listed.length} more`);
  lines.push("");
  if (approved) {
    lines.push(single ? "It now counts in company totals." : "They now count in company totals.");
  } else {
    if (reason) lines.push(`${escapeHtml(reviewerName)}'s reason: <i>${escapeHtml(reason)}</i>`, "");
    lines.push(
      single
        ? "What next: fix the details and resubmit, or delete it if it was a mistake."
        : "What next: open them in the app to fix the details and resubmit, or delete any that were a mistake."
    );
  }

  let keyboard: InlineKeyboard = [];
  if (appUrl) {
    const url = approved
      ? single
        ? `${appUrl}/dashboard/expenses?expand=${items[0].id}`
        : `${appUrl}/dashboard/expenses`
      : single
        ? `${appUrl}/dashboard/expenses/${items[0].id}/edit`
        : `${appUrl}/dashboard/expenses?approval=rejected`;
    keyboard = [[{ text: approved ? "Open in Magick Accounting" : "Fix and resubmit", url }]];
  }
  return { html: lines.join("\n"), keyboard };
}

/** Most Telegram notices sent at once. */
const NOTICE_CONCURRENCY = 5;

/**
 * Tells each submitter with a linked Telegram account about the decision, one
 * message per person. Skips the reviewer's own expenses. Never throws.
 */
export async function notifyReviewOutcome(args: {
  action: ReviewAction;
  expenses: ReviewedExpense[];
  reason: string | null;
  reviewer: AuthUser;
}): Promise<void> {
  try {
    const bySubmitter = new Map<string, ReviewedExpense[]>();
    for (const expense of args.expenses) {
      const submitter = refId(expense.createdBy);
      if (!submitter || submitter === args.reviewer._id) continue;
      bySubmitter.set(submitter, [...(bySubmitter.get(submitter) ?? []), expense]);
    }
    if (bySubmitter.size === 0) return;

    const bot = await getConnectedBot();
    if (!bot) return;

    const users = (await User.find({
      _id: { $in: [...bySubmitter.keys()] },
      "telegram.chatId": { $type: "number" },
    })
      .select("_id telegram")
      .lean()) as unknown as { _id: unknown; telegram?: { chatId?: number } | null }[];
    if (users.length === 0) return;

    const unpopulated = [
      ...new Set(
        args.expenses
          .filter((expense) => expense.currency && !populatedCode(expense.currency))
          .map((expense) => refId(expense.currency))
      ),
    ];
    const codes = new Map<string, string>();
    if (unpopulated.length > 0) {
      const currencies = (await Currency.find({ _id: { $in: unpopulated } })
        .select("_id code")
        .lean()) as unknown as { _id: unknown; code: string }[];
      for (const currency of currencies) codes.set(String(currency._id), currency.code);
    }
    const codeOf = (expense: ReviewedExpense) =>
      populatedCode(expense.currency) ?? codes.get(refId(expense.currency)) ?? undefined;

    const send = (user: (typeof users)[number]) => {
        const chatId = user.telegram?.chatId;
        if (typeof chatId !== "number") return Promise.resolve();
        const items = (bySubmitter.get(String(user._id)) ?? []).map((expense) => ({
          id: refId(expense._id),
          title: expense.title || "Untitled expense",
          amount: formatCurrency(Number(expense.amount ?? 0), codeOf(expense)),
        }));
        const notice = renderReviewNotice({
          action: args.action,
          items,
          reason: args.reason,
          reviewerName: args.reviewer.name || "An admin",
          appUrl: bot.appUrl,
        });
        return sendMessage(bot.token, chatId, notice.html, notice.keyboard.length ? notice.keyboard : undefined);
    };
    // A few at a time: a bulk review can reach many people, and Telegram
    // rate-limits a bot's bursts.
    for (let start = 0; start < users.length; start += NOTICE_CONCURRENCY) {
      const results = await Promise.allSettled(users.slice(start, start + NOTICE_CONCURRENCY).map(send));
      for (const result of results) {
        if (result.status === "rejected") console.error("Approval notice not sent:", result.reason);
      }
    }
  } catch (err) {
    console.error("Approval notices failed:", err);
  }
}
