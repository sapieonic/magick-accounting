import mongoose, { Schema, Document } from "mongoose";

export interface ICategory extends Document {
  name: string;
  isDefault: boolean;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export const DEFAULT_CATEGORIES = [
  "Office Supplies",
  "Travel",
  "Meals & Entertainment",
  "Software & Subscriptions",
  "Equipment & Hardware",
  "Marketing & Advertising",
  "Professional Services",
  "Utilities",
  "Rent & Facilities",
  "Training & Education",
  "Communication",
  "Insurance",
  "Miscellaneous",
];

const CategorySchema = new Schema<ICategory>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    isDefault: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export default mongoose.models.Category || mongoose.model<ICategory>("Category", CategorySchema);
