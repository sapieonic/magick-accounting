"use client";

import { useState, type InputHTMLAttributes } from "react";
import { Save } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import Panel from "@/components/ui/Panel";
import Button from "@/components/ui/Button";
import Field, { inputClass, textareaClass } from "@/components/ui/Field";
import { FieldGrid } from "@/components/ui/FormSection";
import { cn } from "@/components/ui/cn";
import { settingsSectionClass } from "@/components/settings/SettingsNav";

// All fields are kept as strings for the controlled inputs; cgstRate/sgstRate
// are numeric on the wire and coerced via normalizeInvoiceSettings().
export interface InvoiceSettings {
  sellerName: string;
  sellerAddress: string;
  sellerGstin: string;
  hsnSac: string;
  cgstRate: string;
  sgstRate: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankAccountType: string;
  bankIfsc: string;
}

export const EMPTY_INVOICE_SETTINGS: InvoiceSettings = {
  sellerName: "",
  sellerAddress: "",
  sellerGstin: "",
  hsnSac: "",
  cgstRate: "9",
  sgstRate: "9",
  bankAccountName: "",
  bankAccountNumber: "",
  bankAccountType: "",
  bankIfsc: "",
};

// Coerce an API settings payload (cgstRate/sgstRate arrive as numbers) into
// the all-string shape the form inputs expect.
export function normalizeInvoiceSettings(raw: Record<string, unknown>): InvoiceSettings {
  return {
    ...EMPTY_INVOICE_SETTINGS,
    ...raw,
    cgstRate: raw.cgstRate != null ? String(raw.cgstRate) : EMPTY_INVOICE_SETTINGS.cgstRate,
    sgstRate: raw.sgstRate != null ? String(raw.sgstRate) : EMPTY_INVOICE_SETTINGS.sgstRate,
  };
}


interface InvoiceDefaultsSettingsProps {
  id: string;
  /**
   * Saved settings from the page load: the form's starting values only. The
   * form then owns its state (a save refreshes it from the server's reply), so
   * reloads elsewhere on the page never wipe unsaved edits.
   */
  settings: InvoiceSettings;
}

/** Seller, GST and bank details that pre-fill new invoices. */
export default function InvoiceDefaultsSettings({ id, settings }: InvoiceDefaultsSettingsProps) {
  const { toast } = useToast();
  const [values, setValues] = useState(settings);
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.put("/api/invoice-settings", values);
      setValues(normalizeInvoiceSettings(res.settings));
      toast("Invoice defaults saved");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to save invoice defaults", "error");
    } finally {
      setSaving(false);
    }
  };

  /** Props binding a text input to one settings field. */
  const bind = (field: keyof InvoiceSettings, extra?: InputHTMLAttributes<HTMLInputElement>) => ({
    type: "text",
    value: values[field],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setValues((prev) => ({ ...prev, [field]: e.target.value })),
    className: inputClass,
    ...extra,
  });

  const rateProps = { type: "number", min: "0", step: "0.01", inputMode: "decimal" as const, placeholder: "e.g. 9" };

  return (
    <Panel
      id={id}
      className={settingsSectionClass}
      title="Invoice defaults"
      description="Seller and bank details used to pre-fill new invoices."
    >
      <form onSubmit={handleSave} className="flex flex-col gap-5">
        <FieldGrid min={240}>
          <Field label="Seller name">
            <input {...bind("sellerName", { placeholder: "e.g. Magickvoice Llp" })} />
          </Field>
          <Field label="GSTIN">
            <input {...bind("sellerGstin", { placeholder: "36ABCDE1234F1Z5", className: cn(inputClass, "num") })} />
          </Field>
        </FieldGrid>
        <Field label="Address">
          <textarea
            rows={2}
            value={values.sellerAddress}
            onChange={(e) => setValues((prev) => ({ ...prev, sellerAddress: e.target.value }))}
            placeholder={"One line per row — e.g.\nTelangana\nIndia"}
            className={cn(textareaClass, "resize-none")}
          />
        </Field>
        <FieldGrid min={240}>
          <Field label="HSN/SAC code" hint="Applied to every invoice — shown above Place of Supply.">
            <input {...bind("hsnSac", { placeholder: "e.g. 998314", className: cn(inputClass, "num") })} />
          </Field>
          <Field label="CGST %">
            <input {...bind("cgstRate", { ...rateProps, className: cn(inputClass, "num") })} />
          </Field>
          <Field
            label="SGST %"
            hint="CGST and SGST are charged on the taxable amount (sub-total minus any discount)."
          >
            <input {...bind("sgstRate", { ...rateProps, className: cn(inputClass, "num") })} />
          </Field>
        </FieldGrid>

        <div role="group" aria-labelledby={`${id}-bank`} className="flex flex-col gap-4 border-t border-rule-2 pt-4">
          <span id={`${id}-bank`} className="cap text-ink-3">
            Bank details
          </span>
          <FieldGrid min={240}>
            <Field label="Account name">
              <input {...bind("bankAccountName")} />
            </Field>
            <Field label="Account number">
              <input {...bind("bankAccountNumber", { className: cn(inputClass, "num") })} />
            </Field>
            <Field label="Account type">
              <input {...bind("bankAccountType", { placeholder: "e.g. Current" })} />
            </Field>
            <Field label="IFSC">
              <input {...bind("bankIfsc", { className: cn(inputClass, "num") })} />
            </Field>
          </FieldGrid>
        </div>

        <div className="flex justify-end">
          <Button type="submit" icon={Save} loading={saving}>
            {saving ? "Saving..." : "Save invoice defaults"}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
