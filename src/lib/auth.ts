import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "./firebase-admin";
import { connectDB } from "./mongodb";
import User from "@/models/User";
import AllowedDomain from "@/models/AllowedDomain";

export interface AuthUser {
  _id: string;
  email: string;
  name: string;
  role: "master_admin" | "admin" | "user";
  photoURL?: string;
}

export async function verifyAuth(req: NextRequest): Promise<AuthUser | NextResponse> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.split("Bearer ")[1];

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    await connectDB();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user: any = await User.findOne({ email: decoded.email }).lean();
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 401 });
    }

    return {
      _id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
      photoURL: user.photoURL,
    };
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
}

export function requireAdmin(user: AuthUser): NextResponse | null {
  if (user.role !== "admin" && user.role !== "master_admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  return null;
}

export function requireMasterAdmin(user: AuthUser): NextResponse | null {
  if (user.role !== "master_admin") {
    return NextResponse.json({ error: "Master admin access required" }, { status: 403 });
  }
  return null;
}

export async function verifyAndCreateUser(
  token: string
): Promise<{ user: AuthUser; isNew: boolean } | { error: string; status: number }> {
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const email = decoded.email;
    if (!email) return { error: "No email in token", status: 400 };

    const domain = email.split("@")[1];
    await connectDB();

    // On first-ever sign-in, seed the allowed domain from env
    const domainCount = await AllowedDomain.countDocuments();
    if (domainCount === 0) {
      const seedDomain = process.env.INITIAL_ALLOWED_DOMAIN;
      if (seedDomain) {
        await AllowedDomain.create({ domain: seedDomain.toLowerCase().replace("@", "").trim(), addedBy: null });
      }
    }

    const allowedDomain = await AllowedDomain.findOne({ domain });
    if (!allowedDomain) {
      return { error: `Email domain @${domain} is not allowed`, status: 403 };
    }

    let user = await User.findOne({ email });
    let isNew = false;

    if (!user) {
      const masterEmail = process.env.MASTER_ADMIN_EMAIL;
      const role = email === masterEmail ? "master_admin" : "user";

      user = await User.create({
        email,
        name: decoded.name || email.split("@")[0],
        photoURL: decoded.picture || "",
        firebaseUid: decoded.uid,
        role,
      });
      isNew = true;
    }

    return {
      user: {
        _id: user._id.toString(),
        email: user.email,
        name: user.name,
        role: user.role,
        photoURL: user.photoURL,
      },
      isNew,
    };
  } catch {
    return { error: "Invalid token", status: 401 };
  }
}
