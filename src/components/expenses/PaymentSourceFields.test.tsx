import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { getPaymentSplitError } from "@/lib/expense";
import PaymentSourceFields, { paymentDraftsToPayload, type PaymentDraft } from "./PaymentSourceFields";

function Harness({ amount = "1000", error = null }: { amount?: string; error?: string | null }) {
  const [paymentSource, setPaymentSource] = useState("pocket");
  const [pocketAmount, setPocketAmount] = useState("");
  return (
    <PaymentSourceFields
      paymentSource={paymentSource}
      pocketAmount={pocketAmount}
      amount={amount}
      currencySymbol="₹"
      onPaymentSourceChange={setPaymentSource}
      onPocketAmountChange={setPocketAmount}
      error={error}
    />
  );
}

const MEMBERS = [
  { _id: "66c1884c0853f8a76a4da201", name: "Asha", email: "asha@example.com" },
  { _id: "66c1884c0853f8a76a4da202", name: "Ravi", email: "ravi@example.com" },
];

let latestPayments: PaymentDraft[] = [];

function PayersHarness({ amount = "1000" }: { amount?: string }) {
  const [paymentSource, setPaymentSource] = useState("pocket");
  const [payments, setPayments] = useState<PaymentDraft[]>([]);
  latestPayments = payments;
  return (
    <PaymentSourceFields
      paymentSource={paymentSource}
      pocketAmount=""
      amount={amount}
      currencySymbol="₹"
      onPaymentSourceChange={setPaymentSource}
      onPocketAmountChange={() => undefined}
      payments={payments}
      onPaymentsChange={setPayments}
      members={MEMBERS}
      defaultPayerId={MEMBERS[0]._id}
    />
  );
}

describe("getPaymentSplitError", () => {
  it("accepts a pocket share strictly between 0 and the amount", () => {
    expect(getPaymentSplitError("1000", "0.01")).toBeNull();
    expect(getPaymentSplitError("1000", "999.99")).toBeNull();
  });

  it("rejects an empty, zero, negative, full or larger pocket share", () => {
    expect(getPaymentSplitError("1000", "")).toMatch(/enter the amount paid from pocket/i);
    expect(getPaymentSplitError("1000", "0")).toMatch(/more than 0 and less than the total/i);
    expect(getPaymentSplitError("1000", "-5")).toMatch(/more than 0 and less than the total/i);
    expect(getPaymentSplitError("1000", "1000")).toMatch(/more than 0 and less than the total/i);
    expect(getPaymentSplitError("1000", "1200")).toMatch(/more than 0 and less than the total/i);
  });

  it("compares in cents so float noise doesn't pass a full-amount split", () => {
    expect(getPaymentSplitError("0.3", String(0.1 + 0.2))).not.toBeNull();
  });
});

describe("PaymentSourceFields", () => {
  it("shows pocket and computed company fields only for split", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.queryByLabelText(/paid from pocket \(₹\)/i)).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/payment source/i), "split");
    const pocket = screen.getByLabelText(/paid from pocket \(₹\)/i);
    const company = screen.getByLabelText(/paid by company \(₹\)/i);
    expect(company).toHaveAttribute("readonly");
    expect(company).toHaveValue("");

    await user.type(pocket, "250.5");
    expect(company).toHaveValue("749.50");

    await user.selectOptions(screen.getByLabelText(/payment source/i), "company");
    expect(screen.queryByLabelText(/paid by company/i)).not.toBeInTheDocument();
  });

  it("leaves the company share blank while the split doesn't fit", async () => {
    const user = userEvent.setup();
    render(<Harness amount="100" />);

    await user.selectOptions(screen.getByLabelText(/payment source/i), "split");
    await user.type(screen.getByLabelText(/paid from pocket/i), "150");
    expect(screen.getByLabelText(/paid by company/i)).toHaveValue("");
  });

  it("renders the given error against the pocket input", async () => {
    const user = userEvent.setup();
    render(<Harness error="Pocket amount must be more than 0 and less than the total amount" />);

    await user.selectOptions(screen.getByLabelText(/payment source/i), "split");
    const pocket = screen.getByLabelText(/paid from pocket/i);
    expect(pocket).toHaveAttribute("aria-invalid", "true");
    expect(pocket).toHaveAccessibleDescription(
      "Pocket amount must be more than 0 and less than the total amount"
    );
  });

  it("only offers several payers when the page handles payer rows", () => {
    render(<Harness />);
    expect(screen.queryByRole("option", { name: /several people/i })).not.toBeInTheDocument();
  });

  it("starts two payer rows, the first for the current user", async () => {
    const user = userEvent.setup();
    render(<PayersHarness />);

    await user.selectOptions(screen.getByLabelText(/payment source/i), "multiple");

    expect(screen.getByLabelText("Payer 1")).toHaveValue(MEMBERS[0]._id);
    expect(screen.getByLabelText("Payer 2")).toHaveValue("");
    expect(screen.getByRole("button", { name: /remove payment 1/i })).toBeDisabled();
    expect(screen.getByText("₹1000.00 left to assign")).toBeInTheDocument();
  });

  it("records each payer's amount and pocket/company toggle", async () => {
    const user = userEvent.setup();
    render(<PayersHarness />);

    await user.selectOptions(screen.getByLabelText(/payment source/i), "multiple");
    await user.type(screen.getByLabelText(/amount for payment 1/i), "600");
    await user.selectOptions(screen.getByLabelText("Payer 2"), MEMBERS[1]._id);
    await user.type(screen.getByLabelText(/amount for payment 2/i), "400");

    const secondSource = screen.getByRole("group", { name: /payment 2 paid from/i });
    const companyButton = within(secondSource).getByRole("button", { name: "Company" });
    expect(companyButton).toHaveAttribute("aria-pressed", "false");
    await user.click(companyButton);
    expect(companyButton).toHaveAttribute("aria-pressed", "true");

    expect(screen.getByText("Payments match the total")).toBeInTheDocument();
    expect(paymentDraftsToPayload("multiple", latestPayments)).toEqual([
      { paidBy: MEMBERS[0]._id, amount: 600, source: "pocket" },
      { paidBy: MEMBERS[1]._id, amount: 400, source: "company" },
    ]);
  });

  it("adds a payment pre-filled with what's left and removes extra rows", async () => {
    const user = userEvent.setup();
    render(<PayersHarness />);

    await user.selectOptions(screen.getByLabelText(/payment source/i), "multiple");
    await user.type(screen.getByLabelText(/amount for payment 1/i), "300");
    await user.type(screen.getByLabelText(/amount for payment 2/i), "200");
    await user.click(screen.getByRole("button", { name: /add payment/i }));

    expect(screen.getByLabelText(/amount for payment 3/i)).toHaveValue(500);
    await user.click(screen.getByRole("button", { name: /remove payment 1/i }));
    expect(screen.queryByLabelText(/amount for payment 3/i)).not.toBeInTheDocument();
    expect(screen.getByText("₹300.00 left to assign")).toBeInTheDocument();
  });

  it("drops the payer list from the payload for other sources", () => {
    expect(paymentDraftsToPayload("split", [])).toBeUndefined();
  });
});
