import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
  email: string;
  name: string;
  photoURL: string;
  firebaseUid: string;
  role: "master_admin" | "admin" | "user";
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
  },
  { timestamps: true }
);

export default mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
