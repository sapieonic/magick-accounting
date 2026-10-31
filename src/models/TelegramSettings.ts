import mongoose, { Schema, Document } from "mongoose";

// Singleton holding the organization's Telegram bot connection, managed by
// admins in Settings. There is only ever one row, identified by key: "default".
export interface ITelegramSettings extends Document {
  key: string;
  /** Bot API token from @BotFather. Never sent to the client. */
  botToken: string;
  botId: number | null;
  botUsername: string;
  /** Sent by Telegram in X-Telegram-Bot-Api-Secret-Token on every webhook call. */
  webhookSecret: string;
  /** The secret before the last reconnect, still accepted so no update is refused mid-switch. */
  previousWebhookSecret: string;
  /** Public https origin of this app; the webhook lives at <appUrl>/api/telegram/webhook. */
  appUrl: string;
  connectedBy: mongoose.Types.ObjectId | null;
  connectedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const TelegramSettingsSchema = new Schema<ITelegramSettings>(
  {
    key: { type: String, default: "default", unique: true },
    botToken: { type: String, default: "" },
    botId: { type: Number, default: null },
    botUsername: { type: String, default: "" },
    webhookSecret: { type: String, default: "" },
    previousWebhookSecret: { type: String, default: "" },
    appUrl: { type: String, default: "" },
    connectedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    connectedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.models.TelegramSettings ||
  mongoose.model<ITelegramSettings>("TelegramSettings", TelegramSettingsSchema);
