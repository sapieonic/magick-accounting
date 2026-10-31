import mongoose, { Schema, Document } from "mongoose";

export interface ITelegramLink {
  userId: number;
  chatId: number;
  username?: string;
  firstName?: string;
  linkedAt: Date;
}

export interface IUser extends Document {
  email: string;
  name: string;
  photoURL: string;
  firebaseUid: string;
  role: "master_admin" | "admin" | "user";
  /** The Telegram account linked to this user for adding expenses via the bot. */
  telegram?: ITelegramLink | null;
  /** SHA-256 of the pending one-time link code, and when it expires. */
  telegramLinkCodeHash?: string | null;
  telegramLinkCodeExpiresAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    photoURL: { type: String, default: "" },
    firebaseUid: { type: String, required: true, unique: true },
    role: { type: String, enum: ["master_admin", "admin", "user"], default: "user" },
    telegram: {
      type: new Schema<ITelegramLink>(
        {
          userId: { type: Number, required: true },
          chatId: { type: Number, required: true },
          username: { type: String, default: "" },
          firstName: { type: String, default: "" },
          linkedAt: { type: Date, required: true },
        },
        { _id: false }
      ),
      default: null,
    },
    // Never needed in a response; only matched against in queries.
    telegramLinkCodeHash: { type: String, default: null, select: false },
    telegramLinkCodeExpiresAt: { type: Date, default: null, select: false },
  },
  { timestamps: true }
);

// One Telegram account can only be linked to one user.
UserSchema.index(
  { "telegram.userId": 1 },
  { unique: true, partialFilterExpression: { "telegram.userId": { $type: "number" } } }
);
UserSchema.index(
  { telegramLinkCodeHash: 1 },
  { partialFilterExpression: { telegramLinkCodeHash: { $type: "string" } } }
);

export default mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
