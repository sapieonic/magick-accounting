import mongoose, { Schema, Document } from "mongoose";
import {
  PAYMENT_ENTRY_SOURCES,
  PAYMENT_SOURCES,
  type PaymentEntrySource,
  type PaymentSource,
} from "@/lib/expense";
import { TRAVEL_TYPES, type TravelType } from "@/lib/trip";
import {
  APPROVAL_HISTORY_ACTIONS,
  APPROVAL_NOTE_MAX,
  APPROVAL_STATUSES,
  REJECTION_REASON_MAX,
  type ApprovalHistoryAction,
  type ApprovalStatus,
} from "@/lib/approval";

export interface IExpensePayment {
  paidBy: mongoose.Types.ObjectId;
  amount: number;
  amountInBaseCurrency: number;
  source: PaymentEntrySource;
}

export interface IExpenseApprovalEvent {
  action: ApprovalHistoryAction;
  by: mongoose.Types.ObjectId;
  at: Date;
  note: string | null;
}

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
  payments: IExpensePayment[];
  receiptKey?: string;
  receiptFilename?: string;
  trip?: mongoose.Types.ObjectId | null;
  travelType?: TravelType | null;
  createdBy: mongoose.Types.ObjectId;
  /** Missing on documents written before approvals existed; those count as approved. */
  approvalStatus?: ApprovalStatus;
  reviewedBy?: mongoose.Types.ObjectId | null;
  reviewedAt?: Date | null;
  rejectionReason?: string | null;
  approvalHistory: IExpenseApprovalEvent[];
  createdAt: Date;
  updatedAt: Date;
}

const ExpensePaymentSchema = new Schema<IExpensePayment>(
  {
    paidBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true, min: 0 },
    amountInBaseCurrency: { type: Number, required: true, min: 0 },
    source: { type: String, enum: PAYMENT_ENTRY_SOURCES, required: true },
  },
  { _id: false }
);

// One append-only entry in an expense's approval audit trail.
const ApprovalEventSchema = new Schema<IExpenseApprovalEvent>(
  {
    action: { type: String, enum: APPROVAL_HISTORY_ACTIONS, required: true },
    by: { type: Schema.Types.ObjectId, ref: "User", required: true },
    at: { type: Date, required: true },
    note: { type: String, default: null, maxlength: APPROVAL_NOTE_MAX },
  },
  { _id: false }
);

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
    // The document's edit revision, despite the name: every edit, asset
    // reservation/reversal and approval decision increments it, and each of
    // them is a compare-and-swap on it (`revisionMatch` in expense-server.ts).
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
    // One entry per payer when `paymentSource` is "multiple"; empty otherwise.
    // The pocket fields above then hold the sum of the pocket entries.
    payments: { type: [ExpensePaymentSchema], default: [] },
    receiptKey: { type: String },
    receiptFilename: { type: String },
    // The business trip this expense belongs to, if any. `travelType` is only
    // stored alongside a trip and is cleared when the expense leaves it.
    trip: { type: Schema.Types.ObjectId, ref: "Trip", default: null },
    travelType: { type: String, enum: TRAVEL_TYPES, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    // Approval (see src/lib/approval.ts). No default on purpose: every new
    // expense must be given a status by its creation path
    // (`creationApprovalFields`), while documents written before approvals
    // existed keep none and count as approved. `this` is the document on
    // save and a Query in update validators, which never require it.
    approvalStatus: {
      type: String,
      enum: APPROVAL_STATUSES,
      required: function (this: { isNew?: boolean } | undefined) {
        return this?.isNew === true;
      },
    },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: null, trim: true, maxlength: REJECTION_REASON_MAX },
    approvalHistory: { type: [ApprovalEventSchema], default: [] },
  },
  { timestamps: true }
);

// The expense list's sort (`EXPENSE_LIST_SORT`), for everyone and for one
// submitter (role `user`, or `createdBy`); they also serve plain date queries.
ExpenseSchema.index({ date: -1, createdAt: -1, _id: -1 });
ExpenseSchema.index({ createdBy: 1, date: -1, createdAt: -1, _id: -1 });
// The list narrowed by approval status (e.g. the admin review queue).
ExpenseSchema.index({ approvalStatus: 1, date: -1, createdAt: -1, _id: -1 });
// The other half of a `user`'s list: shared expenses they paid part of
// (`visibleToUserFilter`), in the same order so the two halves merge sorted.
ExpenseSchema.index({ "payments.paidBy": 1, date: -1, createdAt: -1, _id: -1 });
ExpenseSchema.index({ department: 1, date: -1 });
ExpenseSchema.index({ category: 1, date: -1 });
ExpenseSchema.index({ currency: 1 });
ExpenseSchema.index({ trip: 1, date: 1 });
ExpenseSchema.index(
  { receiptKey: 1 },
  { unique: true, partialFilterExpression: { receiptKey: { $type: "string" } } }
);

export default mongoose.models.Expense || mongoose.model<IExpense>("Expense", ExpenseSchema);
