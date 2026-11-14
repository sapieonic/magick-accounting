"use client";

import { Building2, Plus, SquareSplitHorizontal, Users, Wallet, X as XIcon } from "lucide-react";
import { IconButton } from "@/components/ui/Button";
import Field, { inputClass, selectClass } from "@/components/ui/Field";
import { FieldGrid } from "@/components/ui/FormSection";
import SegmentedControl, { type SegmentOption } from "@/components/ui/SegmentedControl";
import SplitBar from "@/components/ui/SplitBar";
import { Dot } from "@/components/ui/Badge";
import { cn } from "@/components/ui/cn";
import { ICON_STROKE, textButtonClass } from "@/components/ui/styles";
import { moneyToCents } from "@/lib/asset";
import { formatCurrency } from "@/lib/currency";
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

const SOURCE_OPTIONS: SegmentOption<string>[] = [
  { value: "pocket", label: "Pocket", icon: Wallet },
  { value: "company", label: "Company", icon: Building2 },
  { value: "split", label: "Split", icon: SquareSplitHorizontal },
  { value: "multiple", label: "Several people", icon: Users },
];

const ENTRY_SOURCE_OPTIONS: SegmentOption<PaymentEntrySource>[] = [
  { value: "pocket", label: "Pocket" },
  { value: "company", label: "Company" },
];

const noteClass = "text-[13px] text-ink-2 [text-wrap:pretty]";

interface PaymentSourceFieldsProps {
  paymentSource: string;
  pocketAmount: string;
  amount: string;
  currencySymbol: string;
  /** ISO code for formatted amounts in notes and the split bar. Default INR. */
  currencyCode?: string;
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
  /**
   * Who a pocket share is credited to: the submitter. Omit when that's the
   * person filling in the form ("you"); pass their name when an admin edits
   * someone else's expense.
   */
  submitterName?: string;
}

/** "Who paid": pocket / company / split / several people, with the live split. */
export default function PaymentSourceFields({
  paymentSource,
  pocketAmount,
  amount,
  currencySymbol,
  currencyCode = "INR",
  onPaymentSourceChange,
  onPocketAmountChange,
  error,
  disabled = false,
  payments = [],
  onPaymentsChange,
  members = [],
  defaultPayerId = "",
  paymentsError,
  submitterName,
}: PaymentSourceFieldsProps) {
  const creditedTo = submitterName || "you";
  const isSplit = paymentSource === "split";
  const isMultiple = paymentSource === "multiple" && Boolean(onPaymentsChange);
  const format = (cents: number) => formatCurrency(cents / 100, currencyCode);
  const totalCents = moneyToCents(amount);
  const total = totalCents > 0 ? format(totalCents) : "amount";

  const handleSourceChange = (value: string) => {
    onPaymentSourceChange(value);
    if (value === "multiple" && onPaymentsChange && payments.length === 0) {
      onPaymentsChange([newPaymentDraft({ paidBy: defaultPayerId }), newPaymentDraft()]);
    }
  };
  const splitFits = isSplit && !getPaymentSplitError(amount, pocketAmount);
  const pocketCents = moneyToCents(pocketAmount);
  const companyCents = totalCents - pocketCents;
  const companyAmount = splitFits ? (companyCents / 100).toFixed(2) : "";

  return (
    <fieldset disabled={disabled} className="flex min-w-0 flex-col gap-4">
      <SegmentedControl
        aria-label="Payment source"
        options={onPaymentsChange ? SOURCE_OPTIONS : SOURCE_OPTIONS.filter((o) => o.value !== "multiple")}
        value={paymentSource}
        onChange={handleSourceChange}
        fullWidth
        compact
        disabled={disabled}
      />

      {paymentSource === "pocket" && (
        <p className={noteClass}>The full {total} is credited to {creditedTo} for reimbursement.</p>
      )}
      {paymentSource === "company" && (
        <p className={noteClass}>The full {total} is recorded against the company. Nothing is owed to anyone.</p>
      )}

      {isSplit && (
        <div className="flex flex-col gap-3">
          <FieldGrid>
            <Field
              label={
                <span className="inline-flex items-center gap-1.5">
                  <Dot tone="amber" />
                  Paid from pocket ({currencySymbol})
                </span>
              }
              error={error}
            >
              <input
                id="pocketAmount"
                type="number"
                required
                min="0.01"
                step="0.01"
                value={pocketAmount}
                onChange={(e) => onPocketAmountChange(e.target.value)}
                placeholder="0.00"
                className={cn(inputClass, "num text-right")}
              />
            </Field>
            <Field
              label={
                <span className="inline-flex items-center gap-1.5">
                  <Dot tone="accent" />
                  Paid by company ({currencySymbol})
                </span>
              }
              hint="Worked out as the amount minus the pocket share."
            >
              <input
                id="companyAmount"
                type="text"
                readOnly
                tabIndex={-1}
                value={companyAmount}
                placeholder="—"
                aria-live="polite"
                className={cn(inputClass, "num text-right read-only:bg-sunk")}
              />
            </Field>
          </FieldGrid>
          {splitFits && (
            <>
              <SplitBar
                company={companyCents / 100}
                pocket={pocketCents / 100}
                format={(n) => formatCurrency(n, currencyCode)}
                legend="none"
                size="sm"
              />
              <p className={noteClass}>
                {format(pocketCents)} is credited to {creditedTo}. {format(companyCents)} goes to the company.
              </p>
            </>
          )}
        </div>
      )}

      {isMultiple && onPaymentsChange && (
        <PayerRows
          payments={payments}
          onChange={onPaymentsChange}
          members={members}
          amount={amount}
          currencySymbol={currencySymbol}
          currencyCode={currencyCode}
          error={paymentsError}
        />
      )}
    </fieldset>
  );
}

interface PayerRowsProps {
  payments: PaymentDraft[];
  onChange: (payments: PaymentDraft[]) => void;
  members: PayerOption[];
  amount: string;
  currencySymbol: string;
  currencyCode: string;
  error?: string | null;
}

const MIN_PAYMENTS = 2;

function PayerRows({ payments, onChange, members, amount, currencySymbol, currencyCode, error }: PayerRowsProps) {
  const errorId = error ? "payments-error" : undefined;
  let pocketCents = 0;
  let companyCents = 0;
  for (const entry of payments) {
    if (entry.source === "pocket") pocketCents += moneyToCents(entry.amount);
    else companyCents += moneyToCents(entry.amount);
  }
  const remainingCents = moneyToCents(amount) - pocketCents - companyCents;
  const format = (cents: number) => formatCurrency(cents / 100, currencyCode);

  const update = (key: string, fields: Partial<PaymentDraft>) =>
    onChange(payments.map((entry) => (entry.key === key ? { ...entry, ...fields } : entry)));

  const addPayment = () =>
    onChange([
      ...payments,
      newPaymentDraft({ amount: remainingCents > 0 ? (remainingCents / 100).toFixed(2) : "" }),
    ]);

  return (
    <fieldset className="flex min-w-0 flex-col gap-3">
      <legend className="cap float-left mb-1 w-full text-ink-3">Payers</legend>
      <p className={noteClass}>
        Add each person who paid part of this expense, and whether they paid from their own pocket or with a
        company account.
      </p>

      <ul className="flex flex-col border-y border-rule-2">
        {payments.map((entry, index) => {
          const position = index + 1;
          return (
            <li key={entry.key} className="flex flex-wrap items-center gap-2 border-t border-rule-2 py-2.5 first:border-t-0">
              <select
                aria-label={`Payer ${position}`}
                aria-describedby={errorId}
                required
                value={entry.paidBy}
                onChange={(e) => update(entry.key, { paidBy: e.target.value })}
                className={cn(selectClass, "min-w-0 grow basis-[200px]")}
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
                aria-describedby={errorId}
                aria-invalid={error ? true : undefined}
                type="number"
                required
                min="0.01"
                step="0.01"
                value={entry.amount}
                onChange={(e) => update(entry.key, { amount: e.target.value })}
                placeholder="0.00"
                className={cn(inputClass, "num min-w-0 grow basis-[120px] text-right")}
              />
              <div className="flex items-center gap-1">
                <SegmentedControl
                  aria-label={`Payment ${position} paid from`}
                  options={ENTRY_SOURCE_OPTIONS}
                  value={entry.source}
                  onChange={(source) => update(entry.key, { source })}
                  size="sm"
                />
                <IconButton
                  icon={XIcon}
                  size="sm"
                  onClick={() => onChange(payments.filter((other) => other.key !== entry.key))}
                  disabled={payments.length <= MIN_PAYMENTS}
                  aria-label={`Remove payment ${position}`}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <button type="button" onClick={addPayment} className={textButtonClass}>
          <Plus aria-hidden="true" size={16} strokeWidth={ICON_STROKE} />
          Add payment
        </button>
        <p
          aria-live="polite"
          className={cn("text-[13px] [font-variant-numeric:tabular-nums]", remainingCents === 0 ? "text-ink-2" : "text-amber")}
        >
          {remainingCents === 0
            ? "Payments match the total"
            : remainingCents > 0
              ? `${format(remainingCents)} left to assign`
              : `${format(-remainingCents)} over the total`}
        </p>
      </div>

      {pocketCents + companyCents > 0 && (
        <SplitBar
          company={companyCents / 100}
          pocket={pocketCents / 100}
          format={(n) => formatCurrency(n, currencyCode)}
          legend="inline"
          size="sm"
        />
      )}

      {error && (
        <p id="payments-error" className="text-xs text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}
