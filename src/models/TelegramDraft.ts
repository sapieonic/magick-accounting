import mongoose, { Schema, Document } from "mongoose";

// An expense read from a Telegram message that is waiting for the sender to
// fill the missing fields and confirm it. Saved drafts point at the expense.
export type TelegramDraftStatus = "pending" | "saved" | "discarded";

export interface ITelegramDraft extends Document {
  user: mongoose.Types.ObjectId;
  chatId: number;
  /** The bot message showing this draft; edited in place as it changes. */
  messageId: number | null;
  status: TelegramDraftStatus;
  /** Set while the bot is waiting for the user to type this field. */
  awaiting: "amount" | null;
  title: string;
  amount: number | null;
  gstAmount: number | null;
  currency: mongoose.Types.ObjectId | null;
  category: mongoose.Types.ObjectId | null;
  department: mongoose.Types.ObjectId | null;
  /** Who paid: the sender out of pocket, or the company. */
  paymentSource: "pocket" | "company";
  date: string;
  description: string;
  receiptKey: string | null;
  receiptFilename: string | null;
  expense: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const TelegramDraftSchema = new Schema<ITelegramDraft>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    chatId: { type: Number, required: true },
    messageId: { type: Number, default: null },
    status: { type: String, enum: ["pending", "saved", "discarded"], default: "pending" },
    awaiting: { type: String, enum: ["amount"], default: null },
    title: { type: String, default: "", trim: true },
    amount: { type: Number, default: null, min: 0 },
    gstAmount: { type: Number, default: null, min: 0 },
    currency: { type: Schema.Types.ObjectId, ref: "Currency", default: null },
    category: { type: Schema.Types.ObjectId, ref: "Category", default: null },
    department: { type: Schema.Types.ObjectId, ref: "Department", default: null },
    paymentSource: { type: String, enum: ["pocket", "company"], default: "pocket" },
    date: { type: String, required: true },
    description: { type: String, default: "" },
    receiptKey: { type: String, default: null },
    receiptFilename: { type: String, default: null },
    expense: { type: Schema.Types.ObjectId, ref: "Expense", default: null },
  },
  { timestamps: true }
);

TelegramDraftSchema.index({ user: 1, status: 1, updatedAt: -1 });
// Drafts are short-lived; drop them a month after their last change.
TelegramDraftSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export default mongoose.models.TelegramDraft ||
  mongoose.model<ITelegramDraft>("TelegramDraft", TelegramDraftSchema);
