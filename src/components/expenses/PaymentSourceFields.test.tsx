import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { getPaymentSplitError } from "@/lib/expense";
import PaymentSourceFields from "./PaymentSourceFields";

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
});
