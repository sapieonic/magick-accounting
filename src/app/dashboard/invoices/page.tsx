"use client";

import { useEffect, useMemo, useState, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useTitle } from "@/hooks/useTitle";
import { useToast } from "@/components/ui/Toast";
import Spinner, { PageLoader } from "@/components/ui/Spinner";
import { computeTotals, formatRupees, lineItemAmount } from "@/lib/invoice";
import type { InvoiceData } from "@/types/invoice";
import { FileText, Plus, Trash2 } from "lucide-react";

interface LineRow {
  description: string;
  quantity: string;
  rate: string;
  cgstRate: string;
  sgstRate: string;
}

const newRow = (): LineRow => ({
  description: "",
  quantity: "1",
  rate: "",
  cgstRate: "9",
  sgstRate: "9",
});

export default function InvoicesPage() {
  useTitle("Invoices");
  const router = useRouter();
  const { isAdmin, user } = useAuth();
  const { toast } = useToast();

  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    invoiceNumber: String(Date.now()),
    invoiceDate: new Date().toISOString().split("T")[0],
    dueDate: "",
    terms: "Custom",
    hsnSac: "",
    placeOfSupply: "",
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
        setForm((prev) => ({ ...prev, hsnSac: settings.hsnSac || prev.hsnSac }));
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
    seller: { ...seller },
    customer: { ...customer },
    lineItems: lineItems.map((li) => ({
      description: li.description.trim(),
      quantity: parseFloat(li.quantity) || 0,
      rate: parseFloat(li.rate) || 0,
      cgstRate: parseFloat(li.cgstRate) || 0,
      sgstRate: parseFloat(li.sgstRate) || 0,
    })),
    bank: { ...bank },
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

  if (!isAdmin) return null;
  if (loading) return <PageLoader />;

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-50 text-cyan-500">
          <FileText className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Generate Tax Invoice</h1>
          <p className="text-sm text-gray-500">
            Fill in the details and download a PDF. Invoices are not stored.
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
          </div>
          <p className="mt-3 text-xs text-gray-400">
            HSN/SAC is set once in{" "}
            <span className="font-medium">Settings → Invoice Defaults</span> and applies to the
            whole invoice.
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
                ["Description", "col-span-5"],
                ["Qty", "col-span-1"],
                ["Rate", "col-span-2"],
                ["CGST %", "col-span-1"],
                ["SGST %", "col-span-1"],
                ["Amount", "col-span-2"],
              ].map(([label, span]) => (
                <span
                  key={label}
                  className={`${span} text-xs font-semibold uppercase tracking-wide text-gray-400`}
                >
                  {label}
                </span>
              ))}
            </div>

            {lineItems.map((li, i) => (
              <div
                key={i}
                className="grid grid-cols-2 gap-3 rounded-lg border border-gray-100 p-3 lg:grid-cols-12 lg:border-0 lg:p-0"
              >
                <input
                  type="text"
                  value={li.description}
                  onChange={(e) => updateRow(i, { description: e.target.value })}
                  placeholder="Description"
                  className="input-field col-span-2 lg:col-span-5"
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
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={li.cgstRate}
                  onChange={(e) => updateRow(i, { cgstRate: e.target.value })}
                  placeholder="CGST %"
                  className="input-field tabular-nums lg:col-span-1"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={li.sgstRate}
                  onChange={(e) => updateRow(i, { sgstRate: e.target.value })}
                  placeholder="SGST %"
                  className="input-field tabular-nums lg:col-span-1"
                />
                <div className="col-span-2 flex items-center justify-between gap-2 lg:col-span-2">
                  <span className="truncate text-sm tabular-nums text-gray-700">
                    {formatRupees(
                      lineItemAmount(parseFloat(li.quantity) || 0, parseFloat(li.rate) || 0)
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    disabled={lineItems.length === 1}
                    className="cursor-pointer rounded p-1 text-gray-400 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label="Remove line item"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
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
                <span className="text-gray-500">Sub Total</span>
                <span className="tabular-nums">{formatRupees(totals.subTotal)}</span>
              </div>
              {totals.cgstGroups.map((g) => (
                <div className="flex justify-between" key={`c${g.rate}`}>
                  <span className="text-gray-500">CGST ({g.rate}%)</span>
                  <span className="tabular-nums">{formatRupees(g.amount)}</span>
                </div>
              ))}
              {totals.sgstGroups.map((g) => (
                <div className="flex justify-between" key={`s${g.rate}`}>
                  <span className="text-gray-500">SGST ({g.rate}%)</span>
                  <span className="tabular-nums">{formatRupees(g.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-gray-100 pt-3 text-base font-bold text-gray-900">
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
                  <FileText className="h-4 w-4" /> Generate PDF
                </>
              )}
            </button>
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
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-400">{title}</h2>
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
      <label className="mb-1.5 block text-sm font-medium text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}
