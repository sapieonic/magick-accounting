/**
 * End-to-end accounting checks for who is credited with which rupee.
 *
 * Expenses are built through the same code the API uses to store them
 * (`normalizePaymentSplit` + `buildPaymentFields`), then every place that
 * totals spend is run over them: the Mongo pipelines (executed with mingo) and
 * their client-side mirrors. Amounts are compared in paise (integers), so a
 * single paisa out of place fails the test.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { Aggregator, Query } from "mingo";
import "mingo/init/system";
import type { AuthUser } from "@/lib/auth";

vi.mock("@/models/Expense", () => ({ default: { aggregate: vi.fn() } }));

import Expense from "@/models/Expense";
import { moneyToCents, roundMoney } from "@/lib/asset";
import {
  buildPaymentFields,
  canModifyExpense,
  canViewExpense,
  getPaymentBreakdown,
  normalizePaymentSplit,
  paidByFilter,
  payerShare,
  payerShareExprs,
  payerSpendPipeline,
  spendByPayerPipeline,
  viewerAmounts,
  type PaymentEntry,
  type PaymentSource,
} from "@/lib/expense";
import { buildExpenseFilter, expenseSummaryPipeline, getExpenseSummary } from "@/lib/expense-query";

type Doc = Record<string, unknown> & { _id: mongoose.Types.ObjectId };
type Money = { total: number; pocket: number; company: number };

const oid = (hex: string) => new mongoose.Types.ObjectId(hex);
const A = oid("66c1884c0853f8a76a4da0a1");
const B = oid("66c1884c0853f8a76a4da0a2");
const C = oid("66c1884c0853f8a76a4da0a3");
const D = oid("66c1884c0853f8a76a4da0a4");
const E = oid("66c1884c0853f8a76a4da0a5");
const ADMIN_ID = oid("66c1884c0853f8a76a4da0ff");
const PEOPLE = [A, B, C, D, E];

const asUser = (id: mongoose.Types.ObjectId): AuthUser => ({
  _id: String(id),
  email: "x@example.com",
  name: "X",
  role: "user",
});
const ADMIN: AuthUser = { _id: String(ADMIN_ID), email: "a@example.com", name: "A", role: "admin" };

let nextId = 0;
function newId() {
  nextId += 1;
  return oid(nextId.toString(16).padStart(24, "0"));
}

/** Stores an expense the way POST /api/expenses does. */
function store(input: {
  createdBy: mongoose.Types.ObjectId;
  amount: number;
  rate?: number;
  source: PaymentSource;
  pocket?: number;
  payments?: { paidBy: mongoose.Types.ObjectId; amount: number; source: "pocket" | "company" }[];
  extra?: Record<string, unknown>;
}): Doc {
  const rate = input.rate ?? 1;
  const split = normalizePaymentSplit(
    input.source,
    input.pocket,
    input.amount,
    input.payments?.map((entry) => ({ ...entry, paidBy: String(entry.paidBy) }))
  );
  const amountInBaseCurrency = roundMoney(input.amount * rate);
  const fields = buildPaymentFields(split, amountInBaseCurrency, rate);
  return {
    _id: newId(),
    createdBy: input.createdBy,
    amount: input.amount,
    amountInBaseCurrency,
    exchangeRateToBase: rate,
    ...fields,
    // Payer ids are ObjectIds once Mongoose casts them.
    payments: fields.payments.map((entry) => ({ ...entry, paidBy: oid(entry.paidBy) })),
    ...input.extra,
  };
}

function aggregate(pipeline: unknown[], docs: Doc[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Aggregator(pipeline as any[]).run(docs) as any[];
}

function find(filter: Record<string, unknown>, docs: Doc[]): Doc[] {
  return new Query(filter).find(docs).all() as Doc[];
}

const cents = (money: Money) => ({
  total: moneyToCents(money.total),
  pocket: moneyToCents(money.pocket),
  company: moneyToCents(money.company),
});

/** Spend by User (the admin Users page), keyed by person, in paise. */
function spendByUser(docs: Doc[]): Map<string, ReturnType<typeof cents>> {
  return new Map(
    aggregate(spendByPayerPipeline, docs).map((row) => [
      String(row._id),
      cents({ total: row.totalSpend, pocket: row.pocketSpend, company: row.companySpend }),
    ])
  );
}

/** What `viewer` sees in the summary band / dashboard for `params`, in paise. */
function summaryFor(viewer: AuthUser, docs: Doc[], params = "") {
  const [row] = aggregate(expenseSummaryPipeline(buildExpenseFilter(new URLSearchParams(params), viewer), viewer), docs);
  return {
    count: row?.totalExpenses ?? 0,
    ...cents({ total: row?.totalAmount ?? 0, pocket: row?.pocketAmount ?? 0, company: row?.companyAmount ?? 0 }),
  };
}

const ZERO = { total: 0, pocket: 0, company: 0 };

// ---------------------------------------------------------------------------
// Worked examples, checked by hand to the paisa.

describe("spend accounting — worked examples", () => {
  // 1. A submits a ₹10,000 bill: A paid ₹2,000 and B ₹8,000, both from pocket.
  const bill = store({
    createdBy: A,
    amount: 10000,
    source: "multiple",
    payments: [
      { paidBy: A, amount: 2000, source: "pocket" },
      { paidBy: B, amount: 8000, source: "pocket" },
    ],
  });
  // 2. B submits $100.00 at ₹83.47 paid three ways: A $33.33 pocket, B $33.33
  //    on the company card, C $33.34 pocket. Base total ₹8,347.00; parts
  //    2,782.06 / 2,782.05 / 2,782.89 (running total rounded, then differenced).
  const dollars = store({
    createdBy: B,
    amount: 100,
    rate: 83.47,
    source: "multiple",
    payments: [
      { paidBy: A, amount: 33.33, source: "pocket" },
      { paidBy: B, amount: 33.33, source: "company" },
      { paidBy: C, amount: 33.34, source: "pocket" },
    ],
  });
  // 3. C submits €12.50 at ₹91.2345, €5.00 from pocket: base ₹1,140.43,
  //    pocket ₹456.17, company the rest, ₹684.26.
  const euros = store({ createdBy: C, amount: 12.5, rate: 91.2345, source: "split", pocket: 5 });
  // 4. Documents from before the pocket fields existed.
  const legacyCompany: Doc = { _id: newId(), createdBy: A, amount: 500, paymentSource: "company" };
  const legacyPocket: Doc = { _id: newId(), createdBy: B, amount: 250 };
  const docs = [bill, dollars, euros, legacyCompany, legacyPocket];

  it("stores each payer's part exactly", () => {
    expect(dollars.amountInBaseCurrency).toBe(8347);
    expect((dollars.payments as { amountInBaseCurrency: number }[]).map((p) => p.amountInBaseCurrency)).toEqual([
      2782.06, 2782.05, 2782.89,
    ]);
    expect(dollars.pocketAmountInBaseCurrency).toBe(5564.95);
    expect(euros).toEqual(
      expect.objectContaining({ amountInBaseCurrency: 1140.43, pocketAmount: 5, pocketAmountInBaseCurrency: 456.17 })
    );
  });

  const expected: Record<string, Money> = {
    // 2,000 (bill) + 2,782.06 (dollars) pocket; 500 legacy company.
    [String(A)]: { total: 5282.06, pocket: 4782.06, company: 500 },
    // 8,000 (bill) + 250 (legacy) pocket; 2,782.05 company card (dollars).
    [String(B)]: { total: 11032.05, pocket: 8250, company: 2782.05 },
    // 2,782.89 (dollars) + 456.17 (euros) pocket; 684.26 company (euros).
    [String(C)]: { total: 3923.32, pocket: 3239.06, company: 684.26 },
  };

  it("credits every person exactly their own money in Spend by User", () => {
    const rows = spendByUser(docs);
    expect(rows.size).toBe(3);
    for (const [person, money] of Object.entries(expected)) {
      expect(rows.get(person)).toEqual(cents(money));
    }
  });

  it("shows each person the same figures on their own dashboard", () => {
    expect(summaryFor(asUser(A), docs)).toEqual({ count: 3, ...cents(expected[String(A)]) });
    expect(summaryFor(asUser(B), docs)).toEqual({ count: 3, ...cents(expected[String(B)]) });
    expect(summaryFor(asUser(C), docs)).toEqual({ count: 2, ...cents(expected[String(C)]) });
    // Someone with no expenses sees nothing.
    expect(summaryFor(asUser(D), docs)).toEqual({ count: 0, ...ZERO });
  });

  it("no longer counts B's ₹8,000 as A's pocket money (the reported bug)", () => {
    const a = summaryFor(asUser(A), [bill]);
    const b = summaryFor(asUser(B), [bill]);
    expect(a).toEqual({ count: 1, total: 200000, pocket: 200000, company: 0 });
    expect(b).toEqual({ count: 1, total: 800000, pocket: 800000, company: 0 });
  });

  it("gives the admin whole expenses, which the people's shares add up to", () => {
    const admin = summaryFor(ADMIN, docs);
    expect(admin).toEqual({ count: 5, ...cents({ total: 20237.43, pocket: 16271.12, company: 3966.31 }) });
    const people = Object.values(expected).map(cents);
    for (const key of ["total", "pocket", "company"] as const) {
      expect(people.reduce((sum, money) => sum + money[key], 0)).toBe(admin[key]);
    }
  });

  it("lets each person see exactly the expenses they submitted or paid part of", () => {
    const visible = (person: mongoose.Types.ObjectId) =>
      find(buildExpenseFilter(new URLSearchParams(), asUser(person)), docs).map((doc) => doc._id);
    expect(visible(A)).toEqual([bill._id, dollars._id, legacyCompany._id]);
    expect(visible(B)).toEqual([bill._id, dollars._id, legacyPocket._id]);
    expect(visible(C)).toEqual([dollars._id, euros._id]);
    expect(visible(D)).toEqual([]);
  });

  it("returns the summary rounded to the paisa through getExpenseSummary", async () => {
    vi.mocked(Expense.aggregate).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((pipeline: any[]) => Promise.resolve(new Aggregator(pipeline).run(docs))) as never
    );
    const filter = buildExpenseFilter(new URLSearchParams(), asUser(C));
    expect(await getExpenseSummary(filter, asUser(C))).toEqual({
      totalExpenses: 2,
      totalAmount: 3923.32,
      pocketAmount: 3239.06,
      companyAmount: 684.26,
    });
  });
});

// ---------------------------------------------------------------------------
// Randomized ledger: every rule checked against every other over many expenses.

/** Deterministic PRNG (mulberry32), so a failure reproduces. */
function prng(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const RATES = [1, 1, 1, 83.47, 91.2345, 0.0123, 3.3333333, 0.5, 284.1];
const CATEGORIES = [oid("66c1884c0853f8a76a4db001"), oid("66c1884c0853f8a76a4db002"), oid("66c1884c0853f8a76a4db003")];

function randomLedger(seed: number, size: number): Doc[] {
  const random = prng(seed);
  const pick = <T,>(items: T[]) => items[Math.floor(random() * items.length)];
  const docs: Doc[] = [];
  while (docs.length < size) {
    const createdBy = pick(PEOPLE);
    const date = new Date(Date.UTC(2026, Math.floor(random() * 12), 1 + Math.floor(random() * 28)));
    const extra = { category: pick(CATEGORIES), date };
    const roll = random();

    // Some legacy documents without pocket fields (and sometimes no base amount).
    if (roll < 0.06) {
      const amount = roundMoney(random() * 5000);
      docs.push({
        _id: newId(),
        createdBy,
        amount,
        ...(random() < 0.5 ? { amountInBaseCurrency: amount } : {}),
        ...(random() < 0.7 ? { paymentSource: pick(["pocket", "company"]) } : {}),
        ...extra,
      });
      continue;
    }
    // A "several people" document that lost its payer list counts for its submitter.
    if (roll < 0.08) {
      const amount = roundMoney(1 + random() * 3000);
      docs.push({
        _id: newId(),
        createdBy,
        amount,
        amountInBaseCurrency: amount,
        paymentSource: "multiple",
        pocketAmount: amount,
        pocketAmountInBaseCurrency: amount,
        payments: [],
        ...extra,
      });
      continue;
    }

    // Mostly everyday amounts, some tiny, some large.
    const scale = random() < 0.1 ? 1 : random() < 0.9 ? 20000 : 5_000_000;
    const amount = roundMoney(0.02 + random() * scale);
    const rate = pick(RATES);
    const source = pick<PaymentSource>(["pocket", "company", "split", "multiple", "multiple"]);
    const amountCents = moneyToCents(amount);

    if (source === "split") {
      const pocket = (1 + Math.floor(random() * (amountCents - 1))) / 100;
      docs.push(store({ createdBy, amount, rate, source, pocket, extra }));
    } else if (source === "multiple") {
      // 2–6 parts that add up exactly; each person at most once per source.
      const parts = Math.min(2 + Math.floor(random() * 5), amountCents);
      if (parts < 2) continue;
      const cuts = new Set<number>();
      while (cuts.size < parts - 1) cuts.add(1 + Math.floor(random() * (amountCents - 1)));
      const bounds = [0, ...[...cuts].sort((x, y) => x - y), amountCents];
      const used = new Set<string>();
      const payments: { paidBy: mongoose.Types.ObjectId; amount: number; source: "pocket" | "company" }[] = [];
      for (let i = 0; i < parts; i += 1) {
        let paidBy: mongoose.Types.ObjectId;
        let entrySource: "pocket" | "company";
        do {
          // The submitter often isn't a payer at all.
          paidBy = pick(PEOPLE);
          entrySource = random() < 0.6 ? "pocket" : "company";
        } while (used.has(`${paidBy}:${entrySource}`));
        used.add(`${paidBy}:${entrySource}`);
        payments.push({ paidBy, amount: (bounds[i + 1] - bounds[i]) / 100, source: entrySource });
      }
      docs.push(store({ createdBy, amount, rate, source, payments, extra }));
    } else {
      docs.push(store({ createdBy, amount, rate, source, extra }));
    }
  }
  return docs;
}

describe.each([
  { seed: 1, size: 1500 },
  { seed: 20261125, size: 1500 },
  { seed: 987654321, size: 1500 },
])("spend accounting — randomized ledger (seed $seed)", ({ seed, size }) => {
  const docs = randomLedger(seed, size);
  const baseOf = (doc: Doc) => moneyToCents((doc.amountInBaseCurrency as number | undefined) ?? (doc.amount as number));

  it("splits every expense into non-negative shares that add up exactly to it", () => {
    for (const doc of docs) {
      let total = 0;
      let pocket = 0;
      for (const person of PEOPLE) {
        const share = payerShare(doc, String(person));
        expect(share.pocket).toBeGreaterThanOrEqual(0);
        expect(share.company).toBeGreaterThanOrEqual(0);
        total += moneyToCents(share.pocket) + moneyToCents(share.company);
        pocket += moneyToCents(share.pocket);
      }
      expect(total).toBe(baseOf(doc));
      // The stored pocket figure (used by every company-wide total) is the payers' pocket parts.
      expect(pocket).toBe(moneyToCents(getPaymentBreakdown(doc).pocketBase));
    }
  });

  it("stores payer parts that add up to the expense in its own currency and in base", () => {
    for (const doc of docs) {
      const payments = (doc.payments ?? []) as (PaymentEntry & { amountInBaseCurrency: number })[];
      if (doc.paymentSource !== "multiple" || payments.length === 0) continue;
      expect(payments.reduce((sum, entry) => sum + moneyToCents(entry.amount), 0)).toBe(moneyToCents(doc.amount as number));
      expect(payments.reduce((sum, entry) => sum + moneyToCents(entry.amountInBaseCurrency), 0)).toBe(baseOf(doc));
      const pocketParts = payments.filter((entry) => entry.source === "pocket");
      expect(pocketParts.reduce((sum, entry) => sum + moneyToCents(entry.amount), 0)).toBe(
        moneyToCents(doc.pocketAmount as number)
      );
    }
  });

  it("agrees on each person's spend everywhere it is shown", () => {
    const byUser = spendByUser(docs);
    for (const person of PEOPLE) {
      const id = String(person);
      // Client mirror, summed in paise.
      const mirror = { total: 0, pocket: 0, company: 0 };
      for (const doc of docs) {
        const own = cents(viewerAmounts(doc, { _id: id, role: "user" }));
        mirror.total += own.total;
        mirror.pocket += own.pocket;
        mirror.company += own.company;
      }
      // Admin "Paid by" filter: the payer's share of the expenses listed for them.
      const [paid] = aggregate(payerSpendPipeline(paidByFilter(person), person), docs);
      const paidBy = cents({ total: paid.totalSpend, pocket: paid.pocketSpend, company: paid.companySpend });
      // Single-expression form used by the dashboard, summed without unwinding.
      const exprs = payerShareExprs(person);
      const [direct] = aggregate(
        [{ $group: { _id: null, total: { $sum: exprs.total }, pocket: { $sum: exprs.pocket }, company: { $sum: exprs.company } } }],
        docs
      );
      // Their own dashboard / Expenses summary.
      const { count, ...own } = summaryFor(asUser(person), docs);

      expect(byUser.get(id)).toEqual(mirror);
      expect(paidBy).toEqual(mirror);
      expect(cents(direct)).toEqual(mirror);
      expect(own).toEqual(mirror);
      expect(count).toBe(find(buildExpenseFilter(new URLSearchParams(), asUser(person)), docs).length);
    }
  });

  it("leaves no rupee uncredited or credited twice", () => {
    const admin = summaryFor(ADMIN, docs);
    expect(admin.count).toBe(docs.length);
    expect(admin.total).toBe(docs.reduce((sum, doc) => sum + baseOf(doc), 0));
    expect(admin.pocket + admin.company).toBe(admin.total);

    const people = PEOPLE.map((person) => summaryFor(asUser(person), docs));
    const rows = [...spendByUser(docs).values()];
    for (const key of ["total", "pocket", "company"] as const) {
      expect(people.reduce((sum, money) => sum + money[key], 0)).toBe(admin[key]);
      expect(rows.reduce((sum, money) => sum + money[key], 0)).toBe(admin[key]);
    }
  });

  it("keeps the split exact under every filter (month and category)", () => {
    for (const params of [`category=${CATEGORIES[0]}`, "from=2026-03-01&to=2026-05-31", `category=${CATEGORIES[2]}&from=2026-07-01`]) {
      const admin = summaryFor(ADMIN, docs, params);
      const people = PEOPLE.map((person) => summaryFor(asUser(person), docs, params));
      for (const key of ["total", "pocket", "company"] as const) {
        expect(people.reduce((sum, money) => sum + money[key], 0)).toBe(admin[key]);
      }
    }
  });

  it("lets everyone see every expense that counts toward their spend, and nothing unrelated", () => {
    for (const person of PEOPLE) {
      const viewer = asUser(person);
      const visible = new Set(find(buildExpenseFilter(new URLSearchParams(), viewer), docs).map((doc) => String(doc._id)));
      const credited = new Set(find(paidByFilter(person), docs).map((doc) => String(doc._id)));
      for (const doc of docs) {
        const id = String(doc._id);
        const share = payerShare(doc, String(person));
        if (share.pocket + share.company > 0) expect(credited.has(id)).toBe(true);
        if (credited.has(id)) expect(visible.has(id)).toBe(true);
        // The single-expense check (detail page, receipt) matches the list query.
        expect(canViewExpense(doc, viewer)).toBe(visible.has(id));
        // Only what they submitted can be changed.
        expect(canModifyExpense(doc, viewer)).toBe(String(doc.createdBy) === String(person));
      }
    }
    for (const doc of docs) {
      expect(canViewExpense(doc, ADMIN)).toBe(true);
      expect(canModifyExpense(doc, ADMIN)).toBe(true);
    }
  });

  it("counts whole expenses for an admin in the client mirror too", () => {
    for (const doc of docs) {
      const whole = viewerAmounts(doc, { _id: String(ADMIN_ID), role: "admin" });
      expect(moneyToCents(whole.total)).toBe(baseOf(doc));
      expect(moneyToCents(whole.pocket) + moneyToCents(whole.company)).toBe(baseOf(doc));
    }
  });
});

describe("spend accounting — edits keep the books balanced", () => {
  beforeEach(() => {
    nextId = 1000;
  });

  it("re-splits exactly when an expense's amount or payers change", () => {
    const original = store({
      createdBy: A,
      amount: 999.99,
      rate: 83.47,
      source: "multiple",
      payments: [
        { paidBy: A, amount: 333.33, source: "pocket" },
        { paidBy: B, amount: 333.33, source: "pocket" },
        { paidBy: C, amount: 333.33, source: "company" },
      ],
    });
    // PUT keeps the saved rate while the currency is unchanged.
    const edited = store({
      createdBy: A,
      amount: 1000,
      rate: original.exchangeRateToBase as number,
      source: "multiple",
      payments: [
        { paidBy: B, amount: 600, source: "pocket" },
        { paidBy: D, amount: 400, source: "company" },
      ],
      extra: { _id: original._id },
    });

    const shares = (doc: Doc) => PEOPLE.map((person) => cents({ ...payerShare(doc, String(person)), total: 0 }));
    const sum = (doc: Doc) => shares(doc).reduce((total, money) => total + money.pocket + money.company, 0);
    expect(sum(original)).toBe(moneyToCents(original.amountInBaseCurrency as number));
    expect(sum(edited)).toBe(moneyToCents(edited.amountInBaseCurrency as number));
    // A no longer paid anything after the edit; D now did.
    expect(payerShare(edited, String(A))).toEqual(ZERO_SHARE);
    expect(payerShare(edited, String(D))).toEqual({ pocket: 0, company: 33388 });
    expect(payerShare(edited, String(B))).toEqual({ pocket: 50082, company: 0 });
  });

  it("moves the whole expense back to its submitter when it stops being shared", () => {
    const shared = store({
      createdBy: A,
      amount: 100,
      source: "multiple",
      payments: [
        { paidBy: B, amount: 50, source: "pocket" },
        { paidBy: C, amount: 50, source: "pocket" },
      ],
    });
    const single = store({ createdBy: A, amount: 100, source: "company", extra: { _id: shared._id } });
    expect(single.payments).toEqual([]);
    expect(payerShare(single, String(A))).toEqual({ pocket: 0, company: 100 });
    expect(payerShare(single, String(B))).toEqual(ZERO_SHARE);
    expect(spendByUser([single]).get(String(B))).toBeUndefined();
  });
});

const ZERO_SHARE = { pocket: 0, company: 0 };
