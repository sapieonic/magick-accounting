import mongoose, { Schema, Document } from "mongoose";

export interface IAllowedDomain extends Document {
  domain: string;
  addedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const AllowedDomainSchema = new Schema<IAllowedDomain>(
  {
    domain: { type: String, required: true, unique: true, lowercase: true, trim: true },
    addedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

export default mongoose.models.AllowedDomain || mongoose.model<IAllowedDomain>("AllowedDomain", AllowedDomainSchema);
