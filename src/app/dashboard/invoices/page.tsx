"use client";

import { useEffect, useMemo, useState, type ChangeEvent, type Dispatch, type SetStateAction } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Receipt } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useTitle } from "@/hooks/useTitle";
import { useToast } from "@/components/ui/Toast";
import { FormSkeleton } from "@/components/ui/Skeleton";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Field, { inputClass, selectClass, textareaClass } from "@/components/ui/Field";
import { cn } from "@/components/ui/cn";
import { linkClass, panelClass } from "@/components/ui/styles";
import FormSection, { FieldGrid, SectionRow } from "@/components/ui/FormSection";
import LineItemsTable, { newLineRow, type LineRow } from "@/components/invoice/ui/LineItemsTable";
import InvoiceSummary from "@/components/invoice/ui/InvoiceSummary";
import { computeTotals, formatDiscountLabel } from "@/lib/invoice";
import { PAYMENT_METHODS } from "@/types/invoice";
import type { DiscountType, InvoiceData, ReceiptData } from "@/types/invoice";

type InputEvent = ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>;

/** `{ value, onChange }` for a string field of a state object. */
function binder<T extends object>(state: T, set: Dispatch<SetStateAction<T>>) {
  return (key: keyof T & string) => ({
    value: String(state[key] ?? ""),
    onChange: (e: InputEvent) => set((prev) => ({ ...prev, [key]: e.target.value })),
  });
}

/** Checks shared by the invoice and the receipt; returns the first problem. */
function invoiceError(data: InvoiceData): string | null {
  if (!data.invoiceNumber) return "Invoice number is required";
  if (!data.seller.name) return "Seller name is required";
  if (!data.customer.name) return "Customer name is required";
  if (data.lineItems.every((li) => li.description === "")) {
    return "Add at least one line item with a description";
  }
  return null;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking right after click() can cancel the download in some browsers;
  // release the blob once the download has had time to start.
  setTimeout(() => URL.revokeObjectURL(url), 40_000);
}

const safeFilePart = (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, "_");
const numClass = cn(inputClass, "num");
const required = (
  <span aria-hidden="true" className="text-danger">
    {" "}
    *
  </span>
);

export default function InvoicesPage() {
  useTitle("Invoices");
  const router = useRouter();
  const { isAdmin, user } = useAuth();
  const { toast } = useToast();

  const [generating, setGenerating] = useState(false);
  const [receiptGenerating, setReceiptGenerating] = useState(false);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    invoiceNumber: String(Date.now()),
    invoiceDate: new Date().toISOString().split("T")[0],
    dueDate: "",
    terms: "Custom",
    hsnSac: "",
    placeOfSupply: "",
    cgstRate: "9",
    sgstRate: "9",
    discountType: "none" as "none" | DiscountType,
    discountValue: "",
    discountDescription: "",
  });
  const [seller, setSeller] = useState({
    name: process.env.NEXT_PUBLIC_APP_NAME || "",
    email: "",
    gstin: "",
    address: "",
  });
  const [customer, setCustomer] = useState({ name: "", gstin: "" });
  const [bank, setBank] = useState({
    accountName: "",
    accountNumber: "",
    accountType: "",
    ifsc: "",
  });
  const [lineItems, setLineItems] = useState<LineRow[]>([newLineRow()]);
  const [payment, setPayment] = useState({
    receiptNumber: `RCPT-${Date.now()}`,
    method: PAYMENT_METHODS[0] as string,
    reference: "",
    paidOn: new Date().toISOString().split("T")[0],
    amountReceived: "",
  });

  const bindForm = binder(form, setForm);
  const bindSeller = binder(seller, setSeller);
  const bindCustomer = binder(customer, setCustomer);
  const bindBank = binder(bank, setBank);
  const bindPayment = binder(payment, setPayment);

  useEffect(() => {
    if (!isAdmin) router.replace("/dashboard");
  }, [isAdmin, router]);

  // Autofill the seller email with whoever is logged in.
  useEffect(() => {
    if (user?.email) setSeller((prev) => (prev.email ? prev : { ...prev, email: user.email }));
  }, [user]);

  // Pre-fill seller and bank details from the saved org-level defaults.
  useEffect(() => {
    if (!isAdmin) return;
    async function loadDefaults() {
      try {
        const { settings } = await api.get("/api/invoice-settings");
        setSeller((prev) => ({
          ...prev,
          name: settings.sellerName || prev.name,
          gstin: settings.sellerGstin || prev.gstin,
          address: settings.sellerAddress || prev.address,
        }));
        setForm((prev) => ({
          ...prev,
          hsnSac: settings.hsnSac || prev.hsnSac,
          cgstRate: settings.cgstRate != null ? String(settings.cgstRate) : prev.cgstRate,
          sgstRate: settings.sgstRate != null ? String(settings.sgstRate) : prev.sgstRate,
        }));
        setBank({
          accountName: settings.bankAccountName || "",
          accountNumber: settings.bankAccountNumber || "",
          accountType: settings.bankAccountType || "",
          ifsc: settings.bankIfsc || "",
        });
      } catch {
        toast("Failed to load invoice defaults", "error");
      } finally {
        setLoading(false);
      }
    }
    loadDefaults();
  }, [isAdmin, toast]);

  const buildInvoiceData = (): InvoiceData => ({
    invoiceNumber: form.invoiceNumber.trim(),
    invoiceDate: form.invoiceDate,
    dueDate: form.dueDate || undefined,
    terms: form.terms.trim() || undefined,
    hsnSac: form.hsnSac.trim() || undefined,
    placeOfSupply: form.placeOfSupply.trim() || undefined,
    cgstRate: parseFloat(form.cgstRate) || 0,
    sgstRate: parseFloat(form.sgstRate) || 0,
    seller: { ...seller },
    customer: { ...customer },
    lineItems: lineItems.map((li) => ({
      description: li.description.trim(),
      quantity: parseFloat(li.quantity) || 0,
      rate: parseFloat(li.rate) || 0,
    })),
    discount: (() => {
      if (form.discountType === "none") return undefined;
      const raw = parseFloat(form.discountValue) || 0;
      if (raw <= 0) return undefined;
      const value = form.discountType === "percentage" ? Math.min(raw, 100) : raw;
      return {
        type: form.discountType,
        value,
        description: form.discountDescription.trim() || undefined,
      };
    })(),
    bank: { ...bank },
  });

  const buildReceiptData = (): ReceiptData => ({
    ...buildInvoiceData(),
    receiptNumber: payment.receiptNumber.trim(),
    payment: {
      method: payment.method.trim(),
      reference: payment.reference.trim(),
      paidOn: payment.paidOn,
      amountReceived: payment.amountReceived.trim()
        ? parseFloat(payment.amountReceived) || 0
        : totals.total,
    },
  });

  // Discount type/value live on `form`; seller/customer/bank do not affect totals.
  const totals = useMemo(() => computeTotals(buildInvoiceData()), [form, lineItems]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateRow = (i: number, patch: Partial<LineRow>) =>
    setLineItems((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setLineItems((prev) => [...prev, newLineRow()]);
  const removeRow = (i: number) =>
    setLineItems((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)));

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = buildInvoiceData();
    const problem = invoiceError(data);
    if (problem) return toast(problem, "error");

    setGenerating(true);
    try {
      const blob = await api.postBlob("/api/invoices/generate", data);
      downloadBlob(blob, `invoice-${safeFilePart(data.invoiceNumber)}.pdf`);
      toast("Invoice PDF generated");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to generate invoice", "error");
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateReceipt = async () => {
    const data = buildReceiptData();
    const problem =
      invoiceError(data) ??
      (!data.receiptNumber
        ? "Receipt number is required"
        : !data.payment.method
          ? "Payment method is required"
          : !data.payment.paidOn
            ? "Payment date is required"
            : null);
    if (problem) return toast(problem, "error");

    setReceiptGenerating(true);
    try {
      const blob = await api.postBlob("/api/invoices/receipt", data);
      downloadBlob(blob, `receipt-${safeFilePart(data.receiptNumber)}.pdf`);
      toast("Receipt PDF generated");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to generate receipt", "error");
    } finally {
      setReceiptGenerating(false);
    }
  };

  if (!isAdmin) return null;
  if (loading) return <FormSkeleton />;

  const discounted = form.discountType !== "none";
  const itemCount = lineItems.filter((li) => li.description.trim()).length;

  return (
    <div className="flex animate-fade-in flex-col gap-6">
      <PageHeader
        title="Generate tax invoice"
        meta="Fill in the details and download a tax invoice or payment receipt PDF. Nothing is stored."
      />

      <form onSubmit={handleGenerate} className="flex flex-wrap items-start gap-6">
        <div
          className={cn(
            panelClass,
            "min-w-0 grow-[2] basis-[min(560px,100%)] divide-y divide-rule-2 overflow-hidden"
          )}
        >
          <FormSection title="Invoice details">
            <FieldGrid>
              <Field label={<>Invoice number{required}</>}>
                <input type="text" required {...bindForm("invoiceNumber")} className={numClass} />
              </Field>
              <Field label={<>Invoice date{required}</>}>
                <input type="date" required {...bindForm("invoiceDate")} className={numClass} />
              </Field>
              <Field label="Due date">
                <input type="date" {...bindForm("dueDate")} className={numClass} />
              </Field>
              <Field label="Terms">
                <input type="text" {...bindForm("terms")} placeholder="e.g. Due on receipt" className={inputClass} />
              </Field>
              <Field label="HSN/SAC code">
                <input type="text" {...bindForm("hsnSac")} placeholder="e.g. 998314" className={numClass} />
              </Field>
              <Field label="Place of supply">
                <input
                  type="text"
                  {...bindForm("placeOfSupply")}
                  placeholder="e.g. Telangana (36)"
                  className={inputClass}
                />
              </Field>
            </FieldGrid>
          </FormSection>

          <SectionRow>
            <FormSection title="From" description="Your company, as printed on the invoice.">
              <Field label={<>Name{required}</>}>
                <input type="text" required {...bindSeller("name")} className={inputClass} />
              </Field>
              <FieldGrid min={180}>
                <Field label="Email">
                  <input type="email" {...bindSeller("email")} className={inputClass} />
                </Field>
                <Field label="GSTIN">
                  <input type="text" {...bindSeller("gstin")} placeholder="36ABCDE1234F1Z5" className={numClass} />
                </Field>
              </FieldGrid>
              <Field label="Address" hint="One line per row.">
                <textarea
                  rows={3}
                  {...bindSeller("address")}
                  placeholder={"e.g.\nTelangana\nIndia"}
                  className={cn(textareaClass, "resize-none")}
                />
              </Field>
            </FormSection>
            <FormSection title="Bill to" description="The customer you are invoicing.">
              <Field label={<>Name{required}</>}>
                <input
                  type="text"
                  required
                  {...bindCustomer("name")}
                  placeholder="e.g. Mr. Ashish Chauhan"
                  className={inputClass}
                />
              </Field>
              <Field label="GSTIN">
                <input type="text" {...bindCustomer("gstin")} placeholder="36ABCDE1234F1Z5" className={numClass} />
              </Field>
            </FormSection>
          </SectionRow>

          <FormSection title="Line items" flush>
            <LineItemsTable rows={lineItems} onChange={updateRow} onAdd={addRow} onRemove={removeRow} />
          </FormSection>

          <FormSection
            title="Tax and discount"
            description={
              <>
                HSN/SAC and GST rates default from{" "}
                <Link href="/dashboard/admin/settings" className={linkClass}>
                  Settings → Invoice defaults
                </Link>{" "}
                and apply to the whole invoice. A discount is deducted from the sub-total before CGST and SGST.
              </>
            }
          >
            <FieldGrid min={160}>
              <Field label="CGST %">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  {...bindForm("cgstRate")}
                  placeholder="e.g. 9"
                  className={cn(numClass, "text-right")}
                />
              </Field>
              <Field label="SGST %">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  {...bindForm("sgstRate")}
                  placeholder="e.g. 9"
                  className={cn(numClass, "text-right")}
                />
              </Field>
              <Field label="Discount type">
                <select
                  value={form.discountType}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      discountType: e.target.value as "none" | DiscountType,
                      discountValue: e.target.value === "none" ? "" : form.discountValue,
                    })
                  }
                  className={selectClass}
                >
                  <option value="none">None</option>
                  <option value="percentage">Percentage</option>
                  <option value="fixed">Fixed amount (₹)</option>
                </select>
              </Field>
              {discounted && (
                <Field
                  label="Discount value"
                  hint={form.discountType === "percentage" ? "Percent of the sub-total, up to 100." : "In rupees."}
                >
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    max={form.discountType === "percentage" ? "100" : undefined}
                    value={form.discountValue}
                    onChange={(e) => {
                      const next = e.target.value;
                      const capped =
                        form.discountType === "percentage" && parseFloat(next) > 100 ? "100" : next;
                      setForm({ ...form, discountValue: capped });
                    }}
                    placeholder={form.discountType === "percentage" ? "e.g. 10" : "e.g. 500"}
                    className={cn(numClass, "text-right")}
                  />
                </Field>
              )}
              {discounted && (
                <Field label="Discount label" optional>
                  <input
                    type="text"
                    maxLength={40}
                    {...bindForm("discountDescription")}
                    placeholder="e.g. Volume discount"
                    className={inputClass}
                  />
                </Field>
              )}
            </FieldGrid>
          </FormSection>

          <FormSection title="Bank details" description="Printed on the invoice so the customer knows where to pay.">
            <FieldGrid>
              <Field label="Account name">
                <input type="text" {...bindBank("accountName")} className={inputClass} />
              </Field>
              <Field label="Account number">
                <input type="text" {...bindBank("accountNumber")} className={numClass} />
              </Field>
              <Field label="Account type">
                <input type="text" {...bindBank("accountType")} placeholder="e.g. Current" className={inputClass} />
              </Field>
              <Field label="IFSC">
                <input type="text" {...bindBank("ifsc")} className={numClass} />
              </Field>
            </FieldGrid>
          </FormSection>

          <FormSection
            title="Payment received"
            description="Only used for the payment receipt. Leave amount received blank to use the full invoice total."
          >
            {/* Wider minimum than the other grids so the long placeholders fit. */}
            <FieldGrid min={240}>
              <Field label="Receipt number">
                <input type="text" {...bindPayment("receiptNumber")} className={numClass} />
              </Field>
              <Field label="Payment date">
                <input type="date" {...bindPayment("paidOn")} className={numClass} />
              </Field>
              <Field label="Payment method">
                <select {...bindPayment("method")} className={selectClass}>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Transaction / reference ID">
                <input
                  type="text"
                  {...bindPayment("reference")}
                  placeholder="e.g. UTR / UPI ref / cheque no."
                  className={inputClass}
                />
              </Field>
              <Field label="Amount received">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  {...bindPayment("amountReceived")}
                  placeholder="Defaults to invoice total"
                  className={cn(numClass, "text-right")}
                />
              </Field>
            </FieldGrid>
          </FormSection>
        </div>

        <InvoiceSummary
          // <main> is the scroll container, so top-6 sits 24px below the header.
          className="grow basis-[min(320px,100%)] lg:sticky lg:top-6"
          totals={totals}
          discountLabel={formatDiscountLabel(buildInvoiceData(), totals.discountAmount)}
          invoiceNumber={form.invoiceNumber.trim()}
          invoiceDate={form.invoiceDate}
          dueDate={form.dueDate}
          customerName={customer.name.trim()}
          itemCount={itemCount}
        >
          <div className="flex flex-col gap-2">
            <Button type="submit" icon={FileText} loading={generating} fullWidth>
              {generating ? "Generating…" : "Generate invoice"}
            </Button>
            <Button
              variant="secondary"
              icon={Receipt}
              loading={receiptGenerating}
              onClick={handleGenerateReceipt}
              fullWidth
            >
              {receiptGenerating ? "Generating…" : "Generate receipt"}
            </Button>
            <p className="text-xs text-ink-3">The receipt reuses these invoice details and adds the payment received.</p>
          </div>
        </InvoiceSummary>
      </form>
    </div>
  );
}
