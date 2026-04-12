import mongoose, { Schema, Document } from "mongoose";

export interface ICurrency extends Document {
  code: string;
  name: string;
  symbol: string;
  rateToBase: number;
  isBase: boolean;
  isActive: boolean;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export const DEFAULT_CURRENCIES = [
  { code: "INR", name: "Indian Rupee", symbol: "₹", rateToBase: 1, isBase: true, isActive: true },
];

const CurrencySchema = new Schema<ICurrency>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      match: /^[A-Z]{3}$/,
    },
    name: { type: String, required: true, trim: true },
    symbol: { type: String, required: true, trim: true },
    rateToBase: { type: Number, required: true, min: 0, default: 1 },
    isBase: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

export default mongoose.models.Currency || mongoose.model<ICurrency>("Currency", CurrencySchema);
