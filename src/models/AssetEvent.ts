import mongoose, { Document, Schema } from "mongoose";

export type AssetEventType = "created" | "updated" | "assigned" | "unassigned" | "reversed";

export interface IAssetEvent extends Document {
  asset: mongoose.Types.ObjectId;
  assetTag: string;
  purchaseExpense?: mongoose.Types.ObjectId | null;
  type: AssetEventType;
  actor: mongoose.Types.ObjectId;
  reason: string;
  changes: Record<string, { from: unknown; to: unknown }>;
  snapshot?: Record<string, unknown>;
  occurredAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AssetEventSchema = new Schema<IAssetEvent>(
  {
    asset: { type: Schema.Types.ObjectId, required: true },
    assetTag: { type: String, required: true, trim: true },
    purchaseExpense: { type: Schema.Types.ObjectId, ref: "Expense", default: null },
    type: {
      type: String,
      enum: ["created", "updated", "assigned", "unassigned", "reversed"],
      required: true,
    },
    actor: { type: Schema.Types.ObjectId, ref: "User", required: true },
    reason: { type: String, default: "", trim: true, maxlength: 500 },
    changes: { type: Schema.Types.Mixed, default: {} },
    snapshot: { type: Schema.Types.Mixed, default: null },
    occurredAt: { type: Date, default: Date.now, required: true },
  },
  { timestamps: true }
);

AssetEventSchema.index({ asset: 1, occurredAt: -1 });
AssetEventSchema.index({ purchaseExpense: 1, occurredAt: -1 });

export default mongoose.models.AssetEvent ||
  mongoose.model<IAssetEvent>("AssetEvent", AssetEventSchema);
