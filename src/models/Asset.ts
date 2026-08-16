import mongoose, { Document, Schema } from "mongoose";
import { DEPRECIATION_METHODS, DepreciationMethod } from "@/lib/asset";

export type AssetStatus = "active" | "under_repair" | "retired" | "sold" | "lost" | "disposed";

export const ASSET_STATUSES: AssetStatus[] = [
  "active",
  "under_repair",
  "retired",
  "sold",
  "lost",
  "disposed",
];

export interface IAsset extends Document {
  assetTag: string;
  name: string;
  assetCategory: string;
  serialNumber: string;
  make: string;
  assetModel: string;
  purchaseExpense: mongoose.Types.ObjectId;
  department: mongoose.Types.ObjectId;
  assignedTo?: mongoose.Types.ObjectId | null;
  purpose: string;
  location: string;
  allocatedAmount: number;
  allocatedGstAmount: number;
  recoverableGstAmount: number;
  capitalizedCost: number;
  allocatedAmountInBaseCurrency: number;
  capitalizedCostInBaseCurrency: number;
  depreciationMethod: DepreciationMethod;
  depreciationRate: number;
  residualValue: number;
  putToUseDate: Date;
  status: AssetStatus;
  lifecycleDate?: Date | null;
  disposalProceeds?: number | null;
  lifecycleNotes: string;
  creationBatchId: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const AssetSchema = new Schema<IAsset>(
  {
    assetTag: { type: String, required: true, unique: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    assetCategory: { type: String, required: true, trim: true, maxlength: 100 },
    serialNumber: { type: String, default: "", trim: true, maxlength: 200 },
    make: { type: String, default: "", trim: true, maxlength: 100 },
    assetModel: { type: String, default: "", trim: true, maxlength: 100 },
    purchaseExpense: { type: Schema.Types.ObjectId, ref: "Expense", required: true },
    department: { type: Schema.Types.ObjectId, ref: "Department", required: true },
    assignedTo: { type: Schema.Types.ObjectId, ref: "User", default: null },
    purpose: { type: String, default: "", trim: true, maxlength: 500 },
    location: { type: String, default: "", trim: true, maxlength: 200 },
    allocatedAmount: { type: Number, required: true, min: 0 },
    allocatedGstAmount: { type: Number, default: 0, min: 0 },
    recoverableGstAmount: { type: Number, default: 0, min: 0 },
    capitalizedCost: { type: Number, required: true, min: 0 },
    allocatedAmountInBaseCurrency: { type: Number, required: true, min: 0 },
    capitalizedCostInBaseCurrency: { type: Number, required: true, min: 0 },
    depreciationMethod: {
      type: String,
      enum: DEPRECIATION_METHODS,
      default: "none",
      required: true,
    },
    depreciationRate: { type: Number, default: 0, min: 0, max: 100 },
    residualValue: { type: Number, default: 0, min: 0 },
    putToUseDate: { type: Date, required: true },
    status: { type: String, enum: ASSET_STATUSES, default: "active", required: true },
    lifecycleDate: { type: Date, default: null },
    disposalProceeds: { type: Number, default: null, min: 0 },
    lifecycleNotes: { type: String, default: "", trim: true, maxlength: 1000 },
    creationBatchId: { type: String, required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

AssetSchema.index({ purchaseExpense: 1 });
AssetSchema.index({ assignedTo: 1, status: 1 });
AssetSchema.index({ department: 1, status: 1 });
AssetSchema.index({ assetCategory: 1, status: 1 });
AssetSchema.index({ serialNumber: 1 }, { sparse: true });

export default mongoose.models.Asset || mongoose.model<IAsset>("Asset", AssetSchema);
