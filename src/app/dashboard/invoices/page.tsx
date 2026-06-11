"use client";

import { useEffect, useMemo, useState, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useTitle } from "@/hooks/useTitle";
import { useToast } from "@/components/ui/Toast";
import Spinner from "@/components/ui/Spinner";
import { ListPageSkeleton } from "@/components/ui/Skeleton";
import { computeTotals, formatRupees, lineItemAmount } from "@/lib/invoice";
import { PAYMENT_METHODS } from "@/types/invoice";
import type { InvoiceData, ReceiptData } from "@/types/invoice";
import { FileText, Plus, Receipt, Trash2 } from "lucide-react";

interface LineRow {
  description: string;
  quantity: string;
  rate: string;
}

const newRow = (): LineRow => ({
  description: "",
  quantity: "1",
  rate: "",
});

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
  const [lineItems, setLineItems] = useState<LineRow[]>([newRow()]);
  const [payment, setPayment] = useState({
    receiptNumber: `RCPT-${Date.now()}`,
    method: PAYMENT_METHODS[0] as string,
    reference: "",
    paidOn: new Date().toISOString().split("T")[0],
    amountReceived: "",
  });

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
          cgstRate:
            settings.cgstRate != null ? String(settings.cgstRate) : prev.cgstRate,
          sgstRate:
            settings.sgstRate != null ? String(settings.sgstRate) : prev.sgstRate,
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

  const totals = useMemo(() => computeTotals(buildInvoiceData()), [form, lineItems]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateRow = (i: number, patch: Partial<LineRow>) =>
    setLineItems((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setLineItems((prev) => [...prev, newRow()]);
  const removeRow = (i: number) =>
    setLineItems((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)));

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = buildInvoiceData();

    if (!data.invoiceNumber) return toast("Invoice number is required", "error");
    if (!data.seller.name) return toast("Seller name is required", "error");
    if (!data.customer.name) return toast("Customer name is required", "error");
    if (data.lineItems.every((li) => li.description === "")) {
      return toast("Add at least one line item with a description", "error");
    }

    setGenerating(true);
    try {
      const blob = await api.postBlob("/api/invoices/generate", data);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice-${data.invoiceNumber.replace(/[^a-zA-Z0-9._-]/g, "_")}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast("Invoice PDF generated");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to generate invoice", "error");
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateReceipt = async () => {
    const data = buildReceiptData();

    if (!data.invoiceNumber) return toast("Invoice number is required", "error");
    if (!data.seller.name) return toast("Seller name is required", "error");
    if (!data.customer.name) return toast("Customer name is required", "error");
    if (data.lineItems.every((li) => li.description === "")) {
      return toast("Add at least one line item with a description", "error");
    }
    if (!data.receiptNumber) return toast("Receipt number is required", "error");
    if (!data.payment.method) return toast("Payment method is required", "error");
    if (!data.payment.paidOn) return toast("Payment date is required", "error");

    setReceiptGenerating(true);
    try {
      const blob = await api.postBlob("/api/invoices/receipt", data);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `receipt-${data.receiptNumber.replace(/[^a-zA-Z0-9._-]/g, "_")}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast("Receipt PDF generated");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to generate receipt", "error");
    } finally {
      setReceiptGenerating(false);
    }
  };

  if (!isAdmin) return null;
  if (loading) return <ListPageSkeleton />;

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-50 text-cyan-500 dark:bg-cyan-500/10 dark:text-cyan-400">
          <FileText className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Generate Tax Invoice</h1>
          <p className="text-sm text-muted-foreground">
            Fill in the details and download a tax invoice or payment receipt PDF. Nothing is
            stored.
          </p>
        </div>
      </div>

      <form onSubmit={handleGenerate} className="space-y-6">
        {/* Invoice details */}
        <Section title="Invoice details">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Invoice number" required>
              <input
                type="text"
                required
                value={form.invoiceNumber}
                onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })}
                className="input-field tabular-nums"
              />
            </Field>
            <Field label="Invoice date" required>
              <input
                type="date"
                required
                value={form.invoiceDate}
                onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })}
                className="input-field"
              />
            </Field>
            <Field label="Due date">
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className="input-field"
              />
            </Field>
            <Field label="Terms">
              <input
                type="text"
                value={form.terms}
                onChange={(e) => setForm({ ...form, terms: e.target.value })}
                placeholder="e.g. Due on Receipt"
                className="input-field"
              />
            </Field>
            <Field label="HSN/SAC code">
              <input
                type="text"
                value={form.hsnSac}
                onChange={(e) => setForm({ ...form, hsnSac: e.target.value })}
                placeholder="e.g. 998314"
                className="input-field tabular-nums"
              />
            </Field>
            <Field label="Place of supply">
              <input
                type="text"
                value={form.placeOfSupply}
                onChange={(e) => setForm({ ...form, placeOfSupply: e.target.value })}
                placeholder="e.g. Telangana (36)"
                className="input-field"
              />
            </Field>
            <Field label="CGST %">
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.cgstRate}
                onChange={(e) => setForm({ ...form, cgstRate: e.target.value })}
                placeholder="e.g. 9"
                className="input-field tabular-nums"
              />
            </Field>
            <Field label="SGST %">
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.sgstRate}
                onChange={(e) => setForm({ ...form, sgstRate: e.target.value })}
                placeholder="e.g. 9"
                className="input-field tabular-nums"
              />
            </Field>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            HSN/SAC and GST rates default from{" "}
            <span className="font-medium">Settings → Invoice Defaults</span> and apply to the
            whole invoice — CGST and SGST are charged on the sub-total.
          </p>
        </Section>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Seller */}
          <Section title="From (your details)">
            <div className="space-y-4">
              <Field label="Name" required>
                <input
                  type="text"
                  required
                  value={seller.name}
                  onChange={(e) => setSeller({ ...seller, name: e.target.value })}
                  className="input-field"
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Email">
                  <input
                    type="email"
                    value={seller.email}
                    onChange={(e) => setSeller({ ...seller, email: e.target.value })}
                    className="input-field"
                  />
                </Field>
                <Field label="GSTIN">
                  <input
                    type="text"
                    value={seller.gstin}
                    onChange={(e) => setSeller({ ...seller, gstin: e.target.value })}
                    placeholder="36ABCDE1234F1Z5"
                    className="input-field"
                  />
                </Field>
              </div>
              <Field label="Address">
                <textarea
                  rows={3}
                  value={seller.address}
                  onChange={(e) => setSeller({ ...seller, address: e.target.value })}
                  placeholder="One line per row — e.g.&#10;Telangana&#10;India"
                  className="input-field resize-none"
                />
              </Field>
            </div>
          </Section>

          {/* Customer */}
          <Section title="Bill to (customer)">
            <div className="space-y-4">
              <Field label="Name" required>
                <input
                  type="text"
                  required
                  value={customer.name}
                  onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
                  placeholder="e.g. Mr. Ashish Chauhan"
                  className="input-field"
                />
              </Field>
              <Field label="GSTIN">
                <input
                  type="text"
                  value={customer.gstin}
                  onChange={(e) => setCustomer({ ...customer, gstin: e.target.value })}
                  placeholder="36ABCDE1234F1Z5"
                  className="input-field"
                />
              </Field>
            </div>
          </Section>
        </div>

        {/* Line items */}
        <Section
          title="Line items"
          action={
            <button type="button" onClick={addRow} className="btn-secondary text-sm">
              <Plus className="h-4 w-4" /> Add item
            </button>
          }
        >
          <div className="space-y-3">
            {/* Column header (desktop only — rows stack on mobile) */}
            <div className="hidden grid-cols-12 gap-3 px-1 lg:grid">
              {[
                ["Description", "col-span-6"],
                ["Qty", "col-span-1"],
                ["Rate", "col-span-2"],
                ["Amount", "col-span-3"],
              ].map(([label, span]) => (
                <span
                  key={label}
                  className={`${span} text-xs font-semibold uppercase tracking-wide text-muted-foreground`}
                >
                  {label}
                </span>
              ))}
            </div>

            {lineItems.map((li, i) => (
              <div
                key={i}
                className="grid grid-cols-2 gap-3 rounded-lg border border-line p-3 lg:grid-cols-12 lg:border-0 lg:p-0"
              >
                <input
                  type="text"
                  value={li.description}
                  onChange={(e) => updateRow(i, { description: e.target.value })}
                  placeholder="Description"
                  className="input-field col-span-2 lg:col-span-6"
                />
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={li.quantity}
                  onChange={(e) => updateRow(i, { quantity: e.target.value })}
                  placeholder="Qty"
                  className="input-field tabular-nums lg:col-span-1"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={li.rate}
                  onChange={(e) => updateRow(i, { rate: e.target.value })}
                  placeholder="Rate"
                  className="input-field tabular-nums lg:col-span-2"
                />
                <div className="col-span-2 flex items-center justify-between gap-2 lg:col-span-3">
                  <span className="truncate text-sm tabular-nums text-muted">
                    {formatRupees(
                      lineItemAmount(parseFloat(li.quantity) || 0, parseFloat(li.rate) || 0)
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    disabled={lineItems.length === 1}
                    className="cursor-pointer rounded p-1 text-muted-foreground hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:text-red-400"
                    aria-label="Remove line item"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Payment details — only used when generating a receipt */}
        <Section title="Payment details (for receipt)">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Receipt number">
              <input
                type="text"
                value={payment.receiptNumber}
                onChange={(e) => setPayment({ ...payment, receiptNumber: e.target.value })}
                className="input-field tabular-nums"
              />
            </Field>
            <Field label="Payment date">
              <input
                type="date"
                value={payment.paidOn}
                onChange={(e) => setPayment({ ...payment, paidOn: e.target.value })}
                className="input-field"
              />
            </Field>
            <Field label="Payment method">
              <select
                value={payment.method}
                onChange={(e) => setPayment({ ...payment, method: e.target.value })}
                className="input-field"
              >
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
                value={payment.reference}
                onChange={(e) => setPayment({ ...payment, reference: e.target.value })}
                placeholder="e.g. UTR / UPI ref / cheque no."
                className="input-field"
              />
            </Field>
            <Field label="Amount received">
              <input
                type="number"
                min="0"
                step="0.01"
                value={payment.amountReceived}
                onChange={(e) => setPayment({ ...payment, amountReceived: e.target.value })}
                placeholder="Defaults to invoice total"
                className="input-field tabular-nums"
              />
            </Field>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            These fields are only used for the{" "}
            <span className="font-medium">payment receipt</span>. Leave amount received blank to
            use the full invoice total.
          </p>
        </Section>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Bank details */}
          <Section title="Payment / bank details">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Account name">
                <input
                  type="text"
                  value={bank.accountName}
                  onChange={(e) => setBank({ ...bank, accountName: e.target.value })}
                  className="input-field"
                />
              </Field>
              <Field label="Account number">
                <input
                  type="text"
                  value={bank.accountNumber}
                  onChange={(e) => setBank({ ...bank, accountNumber: e.target.value })}
                  className="input-field tabular-nums"
                />
              </Field>
              <Field label="Account type">
                <input
                  type="text"
                  value={bank.accountType}
                  onChange={(e) => setBank({ ...bank, accountType: e.target.value })}
                  placeholder="e.g. Current"
                  className="input-field"
                />
              </Field>
              <Field label="IFSC">
                <input
                  type="text"
                  value={bank.ifsc}
                  onChange={(e) => setBank({ ...bank, ifsc: e.target.value })}
                  className="input-field"
                />
              </Field>
            </div>
          </Section>

          {/* Summary */}
          <Section title="Summary">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sub Total</span>
                <span className="tabular-nums">{formatRupees(totals.subTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">CGST ({totals.cgstRate}%)</span>
                <span className="tabular-nums">{formatRupees(totals.cgstAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">SGST ({totals.sgstRate}%)</span>
                <span className="tabular-nums">{formatRupees(totals.sgstAmount)}</span>
              </div>
              <div className="flex justify-between border-t border-line pt-3 text-base font-bold text-foreground">
                <span>Total</span>
                <span className="tabular-nums">{formatRupees(totals.total)}</span>
              </div>
            </div>
            <button
              type="submit"
              disabled={generating}
              className="btn-primary mt-6 w-full justify-center"
            >
              {generating ? (
                <>
                  <Spinner size="sm" /> Generating...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4" /> Generate Invoice
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleGenerateReceipt}
              disabled={receiptGenerating}
              className="btn-secondary mt-3 w-full justify-center"
            >
              {receiptGenerating ? (
                <>
                  <Spinner size="sm" /> Generating...
                </>
              ) : (
                <>
                  <Receipt className="h-4 w-4" /> Generate Receipt
                </>
              )}
            </button>
            <p className="mt-3 text-xs text-muted-foreground">
              The receipt reuses these invoice details and adds the payment info above.
            </p>
          </Section>
        </div>
      </form>
    </div>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-muted">
        {label} {required && <span className="text-red-500 dark:text-red-400">*</span>}
      </label>
      {children}
    </div>
  );
}
