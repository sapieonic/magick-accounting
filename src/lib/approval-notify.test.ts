import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notifyReviewOutcome, renderReviewNotice } from "./approval-notify";
import type { AuthUser } from "@/lib/auth";
import { formatCurrency } from "@/lib/currency";
import { sendMessage } from "@/lib/telegram";
import { getConnectedBot } from "@/lib/telegram-server";
import Currency from "@/models/Currency";
import User from "@/models/User";

vi.mock("@/lib/telegram", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/telegram")>();
  return { ...actual, sendMessage: vi.fn() };
});
vi.mock("@/lib/telegram-server", () => ({ getConnectedBot: vi.fn() }));
vi.mock("@/models/User", () => ({ default: { find: vi.fn() } }));
vi.mock("@/models/Currency", () => ({ default: { find: vi.fn() } }));

const ADMIN: AuthUser = { _id: "66c1884c0853f8a76a4da001", email: "a@x.com", name: "Priya", role: "admin" };
const ASHA = "66c1884c0853f8a76a4da101";
const RAVI = "66c1884c0853f8a76a4da102";
const USD = "66c1884c0853f8a76a4da601";
const BOT = {
  token: "123:token",
  botId: 123,
  botUsername: "magick_bot",
  webhookSecret: "s",
  previousWebhookSecret: "",
  appUrl: "https://app.example.com",
};

function query(result: unknown) {
  const q = { select: vi.fn(() => q), lean: vi.fn().mockResolvedValue(result) };
  return q as never;
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.mocked(getConnectedBot).mockResolvedValue(BOT);
  vi.mocked(sendMessage).mockResolvedValue({} as never);
  vi.mocked(Currency.find).mockReturnValue(query([{ _id: USD, code: "USD" }]));
});

afterEach(() => consoleError.mockRestore());

describe("renderReviewNotice", () => {
  it("tells the submitter an expense was approved and links to it", () => {
    const notice = renderReviewNotice({
      action: "approve",
      items: [{ id: "e1", title: "Taxi <airport>", amount: "₹450.00" }],
      reason: null,
      reviewerName: "Priya",
      appUrl: "https://app.example.com",
    });

    expect(notice.html).toContain("✅ <b>Expense approved</b>");
    expect(notice.html).toContain("Taxi &lt;airport&gt; · ₹450.00");
    expect(notice.html).toContain("It now counts in company totals.");
    expect(notice.keyboard).toEqual([
      [{ text: "Open in Magick Accounting", url: "https://app.example.com/dashboard/expenses?expand=e1" }],
    ]);
  });

  it("gives the reason and what to do next on a rejection", () => {
    const notice = renderReviewNotice({
      action: "reject",
      items: [{ id: "e1", title: "Taxi", amount: "₹450.00" }],
      reason: "Receipt <missing>",
      reviewerName: "Priya",
      appUrl: "https://app.example.com",
    });

    expect(notice.html).toContain("❌ <b>Expense rejected</b>");
    expect(notice.html).toContain("Priya's reason: <i>Receipt &lt;missing&gt;</i>");
    expect(notice.html).toContain("What next: fix the details and resubmit, or delete it if it was a mistake.");
    expect(notice.keyboard[0][0]).toEqual({
      text: "Fix and resubmit",
      url: "https://app.example.com/dashboard/expenses/e1/edit",
    });
  });

  it("tells the submitter an expense went back to review, with the admin's note", () => {
    const notice = renderReviewNotice({
      action: "reopen",
      items: [{ id: "e1", title: "Taxi", amount: "₹450.00" }],
      reason: "Wrong <category>",
      reviewerName: "Priya",
      appUrl: "https://app.example.com",
    });

    expect(notice.html).toContain("↩️ <b>Expense moved back to review</b>");
    expect(notice.html).toContain("Priya's note: <i>Wrong &lt;category&gt;</i>");
    expect(notice.html).toContain(
      "An admin will review it again. It doesn't count in company totals until it's approved."
    );
    expect(notice.keyboard).toEqual([
      [{ text: "Open in Magick Accounting", url: "https://app.example.com/dashboard/expenses?expand=e1" }],
    ]);

    const several = renderReviewNotice({
      action: "reopen",
      items: [
        { id: "e1", title: "Taxi", amount: "₹450.00" },
        { id: "e2", title: "Hotel", amount: "₹4,500.00" },
      ],
      reason: null,
      reviewerName: "Priya",
      appUrl: "https://app.example.com",
    });
    expect(several.html).toContain("↩️ <b>2 expenses moved back to review</b>");
    expect(several.html).not.toContain("note:");
    expect(several.keyboard[0][0].url).toBe("https://app.example.com/dashboard/expenses?approval=pending");
  });

  it("lists several expenses, up to ten by name, and skips the button without an app URL", () => {
    const items = Array.from({ length: 12 }, (_, index) => ({ id: `e${index}`, title: `Item ${index}`, amount: "₹1.00" }));
    const notice = renderReviewNotice({ action: "reject", items, reason: "Duplicate", reviewerName: "Priya", appUrl: "" });

    expect(notice.html).toContain("❌ <b>12 expenses rejected</b>");
    expect(notice.html).toContain("• Item 9 · ₹1.00");
    expect(notice.html).not.toContain("Item 10");
    expect(notice.html).toContain("…and 2 more");
    expect(notice.keyboard).toEqual([]);
  });
});

describe("notifyReviewOutcome", () => {
  it("sends one message per linked submitter, never to the reviewer", async () => {
    vi.mocked(User.find).mockReturnValue(query([{ _id: ASHA, telegram: { chatId: 42 } }]));

    await notifyReviewOutcome({
      action: "approve",
      expenses: [
        // Populated, like the single-review response.
        { _id: "e1", title: "Taxi", amount: 450, currency: { code: "INR" }, createdBy: { _id: ASHA, name: "Asha" } },
        // Unpopulated, like bulk results.
        { _id: "e2", title: "Hotel", amount: 10, currency: USD, createdBy: ASHA },
        { _id: "e3", title: "Lunch", amount: 20, currency: USD, createdBy: RAVI },
        { _id: "e4", title: "Own", amount: 5, currency: USD, createdBy: ADMIN._id },
      ],
      reason: null,
      reviewer: ADMIN,
    });

    expect(User.find).toHaveBeenCalledWith({ _id: { $in: [ASHA, RAVI] }, "telegram.chatId": { $type: "number" } });
    expect(sendMessage).toHaveBeenCalledTimes(1);
    const [token, chatId, html, keyboard] = vi.mocked(sendMessage).mock.calls[0];
    expect(token).toBe(BOT.token);
    expect(chatId).toBe(42);
    expect(html).toContain("2 expenses approved");
    expect(html).toContain("Taxi · ₹450.00");
    expect(html).toContain(`Hotel · ${formatCurrency(10, "USD")}`);
    expect(keyboard?.[0][0].url).toBe("https://app.example.com/dashboard/expenses");
  });

  it("tells the submitter when an admin moves their expense back to review", async () => {
    vi.mocked(User.find).mockReturnValue(query([{ _id: ASHA, telegram: { chatId: 42 } }]));

    await notifyReviewOutcome({
      action: "reopen",
      expenses: [{ _id: "e1", title: "Taxi", amount: 450, currency: { code: "INR" }, createdBy: ASHA }],
      reason: "Wrong category",
      reviewer: ADMIN,
    });

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const [, chatId, html] = vi.mocked(sendMessage).mock.calls[0];
    expect(chatId).toBe(42);
    expect(html).toContain("Expense moved back to review");
    expect(html).toContain("Priya's note: <i>Wrong category</i>");
  });

  it("does nothing without a connected bot or when the reviewer reviewed their own", async () => {
    await notifyReviewOutcome({
      action: "approve",
      expenses: [{ _id: "e1", createdBy: ADMIN._id }],
      reason: null,
      reviewer: ADMIN,
    });
    expect(getConnectedBot).not.toHaveBeenCalled();

    vi.mocked(getConnectedBot).mockResolvedValue(null);
    await notifyReviewOutcome({ action: "approve", expenses: [{ _id: "e1", createdBy: ASHA }], reason: null, reviewer: ADMIN });
    expect(User.find).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("never throws, even when Telegram or the database fails", async () => {
    vi.mocked(User.find).mockReturnValue(query([{ _id: ASHA, telegram: { chatId: 42 } }]));
    vi.mocked(sendMessage).mockRejectedValue(new Error("Forbidden: bot was blocked by the user"));
    await expect(
      notifyReviewOutcome({ action: "reject", expenses: [{ _id: "e1", createdBy: ASHA }], reason: "Dup", reviewer: ADMIN })
    ).resolves.toBeUndefined();

    vi.mocked(getConnectedBot).mockRejectedValue(new Error("db down"));
    await expect(
      notifyReviewOutcome({ action: "reject", expenses: [{ _id: "e1", createdBy: ASHA }], reason: "Dup", reviewer: ADMIN })
    ).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledTimes(2);
  });
});

describe("notifyReviewOutcome — rate", () => {
  it("sends at most five notices at once, and every one of them", async () => {
    const submitters = Array.from({ length: 12 }, (_, i) => `66c1884c0853f8a76a4db${String(i).padStart(3, "0")}`);
    vi.mocked(User.find).mockReturnValue(
      query(submitters.map((id, i) => ({ _id: id, telegram: { chatId: 1000 + i } })))
    );
    let inFlight = 0;
    let peak = 0;
    vi.mocked(sendMessage).mockImplementation(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return {} as never;
    });

    await notifyReviewOutcome({
      action: "approve",
      expenses: submitters.map((createdBy, i) => ({
        _id: `66c1884c0853f8a76a4dc${String(i).padStart(3, "0")}`,
        title: `Taxi ${i}`,
        amount: 100,
        createdBy,
      })),
      reason: null,
      reviewer: ADMIN,
    });

    expect(sendMessage).toHaveBeenCalledTimes(12);
    expect(peak).toBe(5);
  });
});
