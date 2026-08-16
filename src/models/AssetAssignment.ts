import mongoose, { Document, Schema } from "mongoose";

export interface IAssetAssignment extends Document {
  asset: mongoose.Types.ObjectId;
  assignedTo: mongoose.Types.ObjectId;
  assignedBy: mongoose.Types.ObjectId;
  department: mongoose.Types.ObjectId;
  purpose: string;
  location: string;
  assignedAt: Date;
  returnedAt?: Date | null;
  returnedRecordedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const AssetAssignmentSchema = new Schema<IAssetAssignment>(
  {
    asset: { type: Schema.Types.ObjectId, ref: "Asset", required: true },
    assignedTo: { type: Schema.Types.ObjectId, ref: "User", required: true },
    assignedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    department: { type: Schema.Types.ObjectId, ref: "Department", required: true },
    purpose: { type: String, default: "", trim: true, maxlength: 500 },
    location: { type: String, default: "", trim: true, maxlength: 200 },
    assignedAt: { type: Date, default: Date.now, required: true },
    returnedAt: { type: Date, default: null },
    returnedRecordedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

AssetAssignmentSchema.index({ asset: 1, assignedAt: -1 });
AssetAssignmentSchema.index({ assignedTo: 1, returnedAt: 1 });
AssetAssignmentSchema.index(
  { asset: 1 },
  { unique: true, partialFilterExpression: { returnedAt: null } }
);

export default mongoose.models.AssetAssignment ||
  mongoose.model<IAssetAssignment>("AssetAssignment", AssetAssignmentSchema);
