"use client";

import { moneyToCents } from "@/lib/asset";
import { getPaymentSplitError } from "@/lib/expense";

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
}: PaymentSourceFieldsProps) {
  const isSplit = paymentSource === "split";
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
          onChange={(e) => onPaymentSourceChange(e.target.value)}
          className="input-field"
        >
          <option value="pocket">Paid from pocket</option>
          <option value="company">Paid from company account</option>
          <option value="split">Split (pocket + company)</option>
        </select>
      </div>

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
