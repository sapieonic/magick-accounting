import mongoose, { Schema, Document } from "mongoose";

// Telegram redelivers a webhook update when it doesn't get a timely 200.
// Recording each (bot, update_id) lets the bot process every update once. A
// row stuck in "processing" (the function was killed mid-update) may be taken
// over by a later redelivery; see claimTelegramUpdate.
export interface ITelegramUpdate extends Document {
  botId: number;
  updateId: number;
  status: "processing" | "done";
  startedAt: Date;
  createdAt: Date;
}

const TelegramUpdateSchema = new Schema<ITelegramUpdate>({
  botId: { type: Number, required: true },
  updateId: { type: Number, required: true },
  status: { type: String, enum: ["processing", "done"], default: "processing" },
  startedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now, expires: 2 * 24 * 60 * 60 },
});

// update_id is only unique per bot.
TelegramUpdateSchema.index({ botId: 1, updateId: 1 }, { unique: true });

export default mongoose.models.TelegramUpdate ||
  mongoose.model<ITelegramUpdate>("TelegramUpdate", TelegramUpdateSchema);
