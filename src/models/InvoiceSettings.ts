import mongoose, { Schema, Document } from "mongoose";

// Singleton document holding org-level defaults used to pre-fill new invoices.
// There is only ever one row, identified by key: "default".
export interface IInvoiceSettings extends Document {
  key: string;
  sellerName: string;
  sellerAddress: string;
  sellerGstin: string;
  hsnSac: string;
  /** CGST rate (%) applied to every invoice sub-total. */
  cgstRate: number;
  /** SGST rate (%) applied to every invoice sub-total. */
  sgstRate: number;
  bankAccountName: string;
  bankAccountNumber: string;
  bankAccountType: string;
  bankIfsc: string;
  createdAt: Date;
  updatedAt: Date;
}

const InvoiceSettingsSchema = new Schema<IInvoiceSettings>(
  {
    key: { type: String, default: "default", unique: true },
    sellerName: { type: String, default: "", trim: true },
    sellerAddress: { type: String, default: "" }, // multi-line, not trimmed
    sellerGstin: { type: String, default: "", trim: true },
    hsnSac: { type: String, default: "", trim: true },
    cgstRate: { type: Number, default: 9, min: 0 },
    sgstRate: { type: Number, default: 9, min: 0 },
    bankAccountName: { type: String, default: "", trim: true },
    bankAccountNumber: { type: String, default: "", trim: true },
    bankAccountType: { type: String, default: "", trim: true },
    bankIfsc: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

export default mongoose.models.InvoiceSettings ||
  mongoose.model<IInvoiceSettings>("InvoiceSettings", InvoiceSettingsSchema);
