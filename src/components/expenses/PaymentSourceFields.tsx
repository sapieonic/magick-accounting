"use client";

import { Plus, X as XIcon } from "lucide-react";
import { moneyToCents } from "@/lib/asset";
import { getPaymentSplitError, type PaymentEntrySource } from "@/lib/expense";

/** One payer row of a `multiple` payment while it is being edited. */
export interface PaymentDraft {
  key: string;
  paidBy: string;
  amount: string;
  source: PaymentEntrySource;
}

export interface PayerOption {
  _id: string;
  name: string;
  email: string;
}

let draftKeyCounter = 0;

export function newPaymentDraft(fields: Partial<Omit<PaymentDraft, "key">> = {}): PaymentDraft {
  draftKeyCounter += 1;
  return { key: `payment-${draftKeyCounter}`, paidBy: "", amount: "", source: "pocket", ...fields };
}

/** The payer list as the API expects it, or `undefined` unless several people paid. */
export function paymentDraftsToPayload(paymentSource: string, payments: PaymentDraft[]) {
  if (paymentSource !== "multiple") return undefined;
  return payments.map(({ paidBy, amount, source }) => ({
    paidBy,
    amount: amount === "" ? null : Number(amount),
    source,
  }));
}

interface PaymentSourceFieldsProps {
  paymentSource: string;
  pocketAmount: string;
  amount: string;
  currencySymbol: string;
  onPaymentSourceChange: (paymentSource: string) => void;
  onPocketAmountChange: (pocketAmount: string) => void;
  /** Error to show under the pocket input; the page decides when to reveal it. */
  error?: string | null;
  disabled?: boolean;
  /** Payer rows for "multiple"; the option only shows when `onPaymentsChange` is given. */
  payments?: PaymentDraft[];
  onPaymentsChange?: (payments: PaymentDraft[]) => void;
  members?: PayerOption[];
  /** Pre-selected payer for the first row when switching to "multiple". */
  defaultPayerId?: string;
  /** Error to show under the payer rows; the page decides when to reveal it. */
  paymentsError?: string | null;
}

export default function PaymentSourceFields({
  paymentSource,
  pocketAmount,
  amount,
  currencySymbol,
  onPaymentSourceChange,
  onPocketAmountChange,
  error,
  disabled = false,
  payments = [],
  onPaymentsChange,
  members = [],
  defaultPayerId = "",
  paymentsError,
}: PaymentSourceFieldsProps) {
  const isSplit = paymentSource === "split";
  const isMultiple = paymentSource === "multiple" && Boolean(onPaymentsChange);

  const handleSourceChange = (value: string) => {
    onPaymentSourceChange(value);
    if (value === "multiple" && onPaymentsChange && payments.length === 0) {
      onPaymentsChange([newPaymentDraft({ paidBy: defaultPayerId }), newPaymentDraft()]);
    }
  };
  const companyCents = moneyToCents(amount) - moneyToCents(pocketAmount);
  const companyAmount =
    isSplit && !getPaymentSplitError(amount, pocketAmount) ? (companyCents / 100).toFixed(2) : "";

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="paymentSource" className="mb-1.5 block text-sm font-medium text-muted">
          Payment Source <span className="text-red-500 dark:text-red-400">*</span>
        </label>
        <select
          id="paymentSource"
          required
          disabled={disabled}
          value={paymentSource}
          onChange={(e) => handleSourceChange(e.target.value)}
          className="input-field"
        >
          <option value="pocket">Paid from pocket</option>
          <option value="company">Paid from company account</option>
          <option value="split">Split (pocket + company)</option>
          {onPaymentsChange && <option value="multiple">Paid by several people</option>}
        </select>
      </div>

      {isMultiple && onPaymentsChange && (
        <PayerRows
          payments={payments}
          onChange={onPaymentsChange}
          members={members}
          amount={amount}
          currencySymbol={currencySymbol}
          error={paymentsError}
          disabled={disabled}
        />
      )}

      {isSplit && (
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="pocketAmount" className="mb-1.5 block text-sm font-medium text-muted">
              Paid from pocket ({currencySymbol}) <span className="text-red-500 dark:text-red-400">*</span>
            </label>
            <input
              id="pocketAmount"
              type="number"
              required
              disabled={disabled}
              min="0.01"
              step="0.01"
              value={pocketAmount}
              onChange={(e) => onPocketAmountChange(e.target.value)}
              placeholder="0.00"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "pocketAmount-error" : undefined}
              className="input-field tabular-nums"
            />
            {error && (
              <p id="pocketAmount-error" className="mt-1 text-xs text-red-500 dark:text-red-400">
                {error}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="companyAmount" className="mb-1.5 block text-sm font-medium text-muted">
              Paid by company ({currencySymbol})
            </label>
            <input
              id="companyAmount"
              type="text"
              readOnly
              tabIndex={-1}
              value={companyAmount}
              placeholder="—"
              aria-describedby="companyAmount-hint"
              aria-live="polite"
              className="input-field tabular-nums"
            />
            <p id="companyAmount-hint" className="mt-1 text-xs text-muted-foreground">
              Worked out as the amount minus the pocket share.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

interface PayerRowsProps {
  payments: PaymentDraft[];
  onChange: (payments: PaymentDraft[]) => void;
  members: PayerOption[];
  amount: string;
  currencySymbol: string;
  error?: string | null;
  disabled: boolean;
}

const MIN_PAYMENTS = 2;

function PayerRows({
  payments,
  onChange,
  members,
  amount,
  currencySymbol,
  error,
  disabled,
}: PayerRowsProps) {
  const enteredCents = payments.reduce((total, entry) => total + moneyToCents(entry.amount), 0);
  const remainingCents = moneyToCents(amount) - enteredCents;

  const update = (key: string, fields: Partial<PaymentDraft>) =>
    onChange(payments.map((entry) => (entry.key === key ? { ...entry, ...fields } : entry)));

  const addPayment = () =>
    onChange([
      ...payments,
      newPaymentDraft({ amount: remainingCents > 0 ? (remainingCents / 100).toFixed(2) : "" }),
    ]);

  const sourceButtonClass = (active: boolean) =>
    `flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed ${
      active ? "bg-brand-500 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
    }`;

  return (
    <fieldset className="space-y-3 rounded-xl border border-line p-4" disabled={disabled}>
      <legend className="px-1 text-sm font-medium text-muted">
        Payments <span className="text-red-500 dark:text-red-400">*</span>
      </legend>
      <p className="text-xs text-muted-foreground">
        Add each person who paid part of this expense, and whether they paid from their own pocket
        or with a company account.
      </p>

      <ul className="space-y-3">
        {payments.map((entry, index) => {
          const position = index + 1;
          return (
            <li
              key={entry.key}
              className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_auto_auto] sm:items-center"
            >
              <select
                aria-label={`Payer ${position}`}
                required
                value={entry.paidBy}
                onChange={(e) => update(entry.key, { paidBy: e.target.value })}
                className="input-field"
              >
                <option value="">Select a person</option>
                {members.map((member) => (
                  <option key={member._id} value={member._id}>
                    {member.name || member.email}
                  </option>
                ))}
              </select>
              <input
                aria-label={`Amount for payment ${position} (${currencySymbol})`}
                type="number"
                required
                min="0.01"
                step="0.01"
                value={entry.amount}
                onChange={(e) => update(entry.key, { amount: e.target.value })}
                placeholder={`${currencySymbol} 0.00`}
                className="input-field tabular-nums"
              />
              <div
                role="group"
                aria-label={`Payment ${position} paid from`}
                className="flex rounded-xl border border-line bg-surface p-1"
              >
                <button
                  type="button"
                  aria-pressed={entry.source === "pocket"}
                  onClick={() => update(entry.key, { source: "pocket" })}
                  className={sourceButtonClass(entry.source === "pocket")}
                >
                  Pocket
                </button>
                <button
                  type="button"
                  aria-pressed={entry.source === "company"}
                  onClick={() => update(entry.key, { source: "company" })}
                  className={sourceButtonClass(entry.source === "company")}
                >
                  Company
                </button>
              </div>
              <button
                type="button"
                onClick={() => onChange(payments.filter((other) => other.key !== entry.key))}
                disabled={payments.length <= MIN_PAYMENTS}
                aria-label={`Remove payment ${position}`}
                className="justify-self-end rounded p-1.5 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={addPayment} className="btn-ghost px-3 py-1.5">
          <Plus className="h-4 w-4" /> Add payment
        </button>
        <p className="text-xs tabular-nums text-muted-foreground" aria-live="polite">
          {remainingCents === 0
            ? "Payments match the total"
            : remainingCents > 0
              ? `${currencySymbol}${(remainingCents / 100).toFixed(2)} left to assign`
              : `${currencySymbol}${(-remainingCents / 100).toFixed(2)} over the total`}
        </p>
      </div>

      {error && (
        <p role="alert" className="text-xs text-red-500 dark:text-red-400">
          {error}
        </p>
      )}
    </fieldset>
  );
}
