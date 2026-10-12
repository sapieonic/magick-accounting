import mongoose, { Schema, Document } from "mongoose";
import { PAYMENT_SOURCES, type PaymentSource } from "@/lib/expense";

export interface IExpense extends Document {
  title: string;
  amount: number;
  gstAmount?: number;
  gstAmountInBaseCurrency?: number;
  currency?: mongoose.Types.ObjectId;
  amountInBaseCurrency?: number;
  exchangeRateToBase?: number;
  assetAllocatedAmount: number;
  assetAllocatedGstAmount: number;
  assetAllocationRevision: number;
  category: mongoose.Types.ObjectId;
  department: mongoose.Types.ObjectId;
  date: Date;
  description: string;
  paymentSource: PaymentSource;
  pocketAmount?: number | null;
  pocketAmountInBaseCurrency?: number | null;
  receiptKey?: string;
  receiptFilename?: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ExpenseSchema = new Schema<IExpense>(
  {
    title: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    // GST (tax) portion included in `amount`, in the expense's own currency.
    gstAmount: { type: Number, default: null, min: 0 },
    gstAmountInBaseCurrency: { type: Number, default: null, min: 0 },
    currency: { type: Schema.Types.ObjectId, ref: "Currency", default: null },
    amountInBaseCurrency: { type: Number, default: null },
    exchangeRateToBase: { type: Number, default: null, min: 0 },
    assetAllocatedAmount: { type: Number, default: 0, min: 0 },
    assetAllocatedGstAmount: { type: Number, default: 0, min: 0 },
    assetAllocationRevision: { type: Number, default: 0, min: 0 },
    category: { type: Schema.Types.ObjectId, ref: "Category", required: true },
    department: { type: Schema.Types.ObjectId, ref: "Department", required: true },
    date: { type: Date, required: true },
    description: { type: String, default: "", trim: true },
    paymentSource: {
      type: String,
      enum: PAYMENT_SOURCES,
      default: "pocket",
      required: true,
    },
    // Portion paid out of the user's pocket, in the expense's own currency.
    // The company share is always derived as `amount - pocketAmount`.
    // Absent on legacy docs; see `pocketBaseExpr` in src/lib/expense.ts.
    pocketAmount: { type: Number, default: null, min: 0 },
    pocketAmountInBaseCurrency: { type: Number, default: null, min: 0 },
    receiptKey: { type: String },
    receiptFilename: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

ExpenseSchema.index({ date: -1 });
ExpenseSchema.index({ department: 1, date: -1 });
ExpenseSchema.index({ createdBy: 1, date: -1 });
ExpenseSchema.index({ category: 1, date: -1 });
ExpenseSchema.index({ currency: 1 });
ExpenseSchema.index(
  { receiptKey: 1 },
  { unique: true, partialFilterExpression: { receiptKey: { $type: "string" } } }
);

export default mongoose.models.Expense || mongoose.model<IExpense>("Expense", ExpenseSchema);
