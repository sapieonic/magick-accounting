import mongoose, { Schema, Document } from "mongoose";

export type PaymentSource = "pocket" | "company";

export const PAYMENT_SOURCES: PaymentSource[] = ["pocket", "company"];

export interface IExpense extends Document {
  title: string;
  amount: number;
  gstAmount?: number;
  gstAmountInBaseCurrency?: number;
  currency?: mongoose.Types.ObjectId;
  amountInBaseCurrency?: number;
  category: mongoose.Types.ObjectId;
  department: mongoose.Types.ObjectId;
  date: Date;
  description: string;
  paymentSource: PaymentSource;
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

export default mongoose.models.Expense || mongoose.model<IExpense>("Expense", ExpenseSchema);
