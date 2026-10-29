import mongoose, { Schema, Document } from "mongoose";

/**
 * A business trip that groups ordinary expenses (each `Expense.trip` points
 * here). Totals are always derived from the expenses, never stored, and the
 * status (upcoming / ongoing / completed) is derived from the dates.
 */
export interface ITrip extends Document {
  name: string;
  purpose: string;
  destinations: string[];
  // UTC midnight of the first and last day, like expense dates.
  startDate: Date;
  endDate: Date;
  travelers: mongoose.Types.ObjectId[];
  // Default department for the trip's expenses.
  department?: mongoose.Types.ObjectId | null;
  // Optional, in base currency.
  budget?: number | null;
  notes: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const TripSchema = new Schema<ITrip>(
  {
    name: { type: String, required: true, trim: true },
    purpose: { type: String, default: "", trim: true },
    destinations: { type: [String], default: [] },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    travelers: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [] },
    department: { type: Schema.Types.ObjectId, ref: "Department", default: null },
    budget: { type: Number, default: null, min: 0 },
    notes: { type: String, default: "", trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

TripSchema.index({ startDate: -1 });
TripSchema.index({ travelers: 1, startDate: -1 });
TripSchema.index({ createdBy: 1, startDate: -1 });

export default mongoose.models.Trip || mongoose.model<ITrip>("Trip", TripSchema);
