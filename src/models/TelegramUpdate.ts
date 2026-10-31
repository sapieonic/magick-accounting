import mongoose, { Schema, Document } from "mongoose";

// Telegram redelivers a webhook update when it doesn't get a timely 200.
// Recording each update_id lets the bot process every update at most once.
export interface ITelegramUpdate extends Document {
  updateId: number;
  createdAt: Date;
}

const TelegramUpdateSchema = new Schema<ITelegramUpdate>({
  updateId: { type: Number, required: true, unique: true },
  createdAt: { type: Date, default: Date.now, expires: 2 * 24 * 60 * 60 },
});

export default mongoose.models.TelegramUpdate ||
  mongoose.model<ITelegramUpdate>("TelegramUpdate", TelegramUpdateSchema);
