"use client";

import type { Dispatch, FormEvent, InputHTMLAttributes, ReactNode, SetStateAction } from "react";
import { Check, ChevronLeft, Sparkles } from "lucide-react";
import Button from "@/components/ui/Button";
import Field, { aiFilledClass, inputClass, selectClass, textareaClass } from "@/components/ui/Field";
import PageHeader from "@/components/ui/PageHeader";
import { cn } from "@/components/ui/cn";
import { panelClass } from "@/components/ui/styles";
import PaymentSourceFields from "@/components/expenses/PaymentSourceFields";
import TripFields, { type TripOption } from "@/components/expenses/TripFields";
import { formatCurrency } from "@/lib/currency";
import type { TravelType } from "@/lib/trip";
import FormSection, { FieldGrid, FormFooter } from "@/components/ui/FormSection";
import { getPaymentErrors } from "./expense-form";
import type { AiField, ExpenseFormValues, ExpenseLookups } from "./types";

/** "from receipt" marker for a Field's label row. */
function FromReceipt() {
  return (
    <>
      <Sparkles aria-hidden="true" size={12} strokeWidth={1.8} />
      from receipt
    </>
  );
}

/** Currency select + amount input on one row; Field's id and description land on the amount. */
function AmountControl({ currencySelect, ...input }: InputHTMLAttributes<HTMLInputElement> & { currencySelect: ReactNode }) {
  return (
    <div className="flex gap-2">
      {currencySelect}
      <input {...input} />
    </div>
  );
}

export interface ExpenseFormProps {
  /** Page heading, e.g. "New expense". */
  heading: string;
  /** Accessible name of the back control, e.g. "Back to Expenses". */
  backLabel: string;
  /** Back and Cancel (the page confirms unsaved changes). */
  onCancel: () => void;
  values: ExpenseFormValues;
  onValuesChange: Dispatch<SetStateAction<ExpenseFormValues>>;
  /** Called after the user edits a field directly (not via trip/receipt defaults). */
  onEdit?: (field: keyof ExpenseFormValues) => void;
  /** Overrides the plain date update (the new form also moves asset dates). */
  onDateChange?: (date: string) => void;
  onTripChange: (tripId: string) => void;
  onTravelTypeChange: (travelType: TravelType | null) => void;
  lookups: ExpenseLookups;
  trips: TripOption[];
  /** The stored trip, shown by name even when it isn't in `trips`. */
  currentTrip?: { _id: string; name: string } | null;
  /** First payer when switching to "several people". */
  defaultPayerId?: string;
  /** Fields the receipt filled in, marked until edited. */
  aiFilled?: ReadonlySet<AiField> | null;
  /** Locks the accounting fields (amount, GST, date, category, department, payment, receipt). */
  locked?: boolean;
  currencyLocked?: boolean;
  /** The receipt column. */
  receipt: ReactNode;
  /** Extra sections at the end of the form (e.g. company assets). */
  children?: ReactNode;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  submitLabel: string;
  /** Label while `busy`. */
  busyLabel?: string;
  busy?: boolean;
  submitDisabled?: boolean;
}

/**
 * The expense form shared by New and Edit: receipt column beside the ruled
 * form panel (stacks on narrow screens), with a sticky action footer.
 */
export default function ExpenseForm({
  heading,
  backLabel,
  onCancel,
  values,
  onValuesChange,
  onEdit,
  onDateChange,
  onTripChange,
  onTravelTypeChange,
  lookups,
  trips,
  currentTrip,
  defaultPayerId,
  aiFilled,
  locked = false,
  currencyLocked = false,
  receipt,
  children,
  onSubmit,
  submitLabel,
  busyLabel = "Saving…",
  busy = false,
  submitDisabled = false,
}: ExpenseFormProps) {
  const currency = lookups.currencies.find((c) => c._id === values.currency);
  const symbol = currency?.symbol || "?";
  const { visibleSplitError, visiblePaymentsError } = getPaymentErrors(values);
  const amountValue = Number(values.amount);
  const hasAmount = values.amount !== "" && Number.isFinite(amountValue) && amountValue > 0;

  const set = <K extends keyof ExpenseFormValues>(field: K, value: ExpenseFormValues[K]) => {
    onValuesChange((prev) => ({ ...prev, [field]: value }));
    onEdit?.(field);
  };
  const ai = (field: AiField) => Boolean(aiFilled?.has(field));
  const aside = (...fields: AiField[]) => (fields.some(ai) ? <FromReceipt /> : undefined);
  const backText = backLabel.replace(/^Back to /, "");

  return (
    <div className="animate-fade-in flex flex-col gap-6">
      <PageHeader
        eyebrow={
          <button
            type="button"
            onClick={onCancel}
            aria-label={backLabel}
            className="-my-3 -ml-1 inline-flex cursor-pointer items-center gap-0.5 px-1 py-3 text-[13px] font-normal normal-case tracking-normal text-ink-3 transition-colors duration-140 hover:text-accent"
          >
            <ChevronLeft aria-hidden="true" size={14} strokeWidth={1.75} />
            {backText}
          </button>
        }
        title={heading}
      />

      <div className="flex flex-wrap items-start gap-6">
        <section aria-label="Receipt" className="flex min-w-0 flex-[1_1_320px] flex-col gap-4 lg:sticky lg:top-6">
          {receipt}
        </section>

        <form
          onSubmit={onSubmit}
          aria-label="Expense details"
          className={cn(panelClass, "flex min-w-0 flex-[2_1_460px] flex-col")}
        >
          <div className="flex flex-col divide-y divide-rule-2">
            <FormSection title="Details">
              <Field label="Title" aside={aside("title")}>
                <input
                  id="title"
                  type="text"
                  required
                  value={values.title}
                  onChange={(e) => set("title", e.target.value)}
                  placeholder="e.g. Office supplies from Amazon"
                  className={cn(inputClass, ai("title") && aiFilledClass)}
                />
              </Field>

              <FieldGrid>
                <Field
                  label="Amount"
                  aside={aside("amount", "currency")}
                  hint={
                    currency && !currency.isBase
                      ? `Converted to INR at the current ${currency.code} rate when you save.`
                      : "Base currency, no conversion."
                  }
                >
                  <AmountControl
                    id="amount"
                    type="number"
                    required
                    disabled={locked}
                    min="0"
                    step="0.01"
                    value={values.amount}
                    onChange={(e) => set("amount", e.target.value)}
                    placeholder="0.00"
                    className={cn(inputClass, "num min-w-0 flex-1 text-right", ai("amount") && aiFilledClass)}
                    currencySelect={
                      <select
                        aria-label="Currency"
                        required
                        disabled={currencyLocked}
                        value={values.currency}
                        onChange={(e) => set("currency", e.target.value)}
                        className={cn(selectClass, "w-[7.5rem] shrink-0", ai("currency") && aiFilledClass)}
                      >
                        <option value="">Select</option>
                        {lookups.currencies.map((c) => (
                          <option key={c._id} value={c._id}>
                            {c.code} {c.symbol}
                          </option>
                        ))}
                      </select>
                    }
                  />
                </Field>

                <Field
                  label={`GST amount (${symbol})`}
                  optional
                  aside={aside("gstAmount")}
                  hint="Tax already included in the amount. Leave blank if not applicable."
                >
                  <input
                    id="gstAmount"
                    type="number"
                    min="0"
                    step="0.01"
                    disabled={locked}
                    value={values.gstAmount}
                    onChange={(e) => set("gstAmount", e.target.value)}
                    placeholder="0.00"
                    className={cn(inputClass, "num text-right", ai("gstAmount") && aiFilledClass)}
                  />
                </Field>

                <Field label="Date" aside={aside("date")}>
                  <input
                    id="date"
                    type="date"
                    required
                    disabled={locked}
                    value={values.date}
                    onChange={(e) => {
                      if (!onDateChange) return set("date", e.target.value);
                      onDateChange(e.target.value);
                      onEdit?.("date");
                    }}
                    className={cn(inputClass, ai("date") && aiFilledClass)}
                  />
                </Field>

                <Field label="Category" aside={aside("category")}>
                  <select
                    id="category"
                    required
                    disabled={locked}
                    value={values.category}
                    onChange={(e) => set("category", e.target.value)}
                    className={cn(selectClass, ai("category") && aiFilledClass)}
                  >
                    <option value="">Select a category</option>
                    {lookups.categories.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Department">
                  <select
                    id="department"
                    required
                    disabled={locked}
                    value={values.department}
                    onChange={(e) => set("department", e.target.value)}
                    className={selectClass}
                  >
                    <option value="">Select a department</option>
                    {lookups.departments.map((d) => (
                      <option key={d._id} value={d._id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </FieldGrid>

              <TripFields
                trips={trips}
                trip={values.trip}
                travelType={values.travelType}
                onTripChange={onTripChange}
                onTravelTypeChange={onTravelTypeChange}
                date={values.date}
                currentTrip={currentTrip}
              />
            </FormSection>

            <FormSection title="Who paid">
              <PaymentSourceFields
                paymentSource={values.paymentSource}
                pocketAmount={values.pocketAmount}
                amount={values.amount}
                currencySymbol={symbol}
                currencyCode={currency?.code}
                onPaymentSourceChange={(paymentSource) => onValuesChange((prev) => ({ ...prev, paymentSource }))}
                onPocketAmountChange={(pocketAmount) => onValuesChange((prev) => ({ ...prev, pocketAmount }))}
                error={visibleSplitError}
                disabled={locked}
                payments={values.payments}
                onPaymentsChange={(payments) => onValuesChange((prev) => ({ ...prev, payments }))}
                members={lookups.members}
                defaultPayerId={defaultPayerId}
                paymentsError={visiblePaymentsError}
              />
            </FormSection>

            <FormSection>
              <Field label="Description" optional aside={aside("description")}>
                <textarea
                  id="description"
                  rows={3}
                  value={values.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="Anything finance should know"
                  className={cn(textareaClass, "resize-y", ai("description") && aiFilledClass)}
                />
              </Field>
            </FormSection>

            {children && <FormSection>{children}</FormSection>}
          </div>

          <FormFooter className="justify-between">
            <span className="text-sm text-ink-2">
              {hasAmount ? (
                <>
                  Total{" "}
                  <span className="num font-medium text-ink">{formatCurrency(amountValue, currency?.code || "INR")}</span>
                </>
              ) : (
                "Enter an amount to see the total"
              )}
            </span>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button variant="secondary" onClick={onCancel}>
                Cancel
              </Button>
              <Button type="submit" icon={Check} loading={busy} disabled={submitDisabled}>
                {busy ? busyLabel : submitLabel}
              </Button>
            </div>
          </FormFooter>
        </form>
      </div>
    </div>
  );
}
