import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Department from "@/models/Department";
import Category from "@/models/Category";
import Currency from "@/models/Currency";

const DEFAULT_INCLUDES = ["departments", "categories", "currencies"] as const;

export async function GET(req: NextRequest) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  await connectDB();

  const includeParam = new URL(req.url).searchParams.get("include");
  const requested = new Set(
    (includeParam ? includeParam.split(",") : [...DEFAULT_INCLUDES])
      .map((value) => value.trim())
      .filter(Boolean)
  );

  const [departments, categories, currencies] = await Promise.all([
    requested.has("departments")
      ? Department.find().select("name isDefault").sort({ isDefault: -1, name: 1 }).lean()
      : Promise.resolve([]),
    requested.has("categories")
      ? Category.find().select("name").sort({ isDefault: -1, name: 1 }).lean()
      : Promise.resolve([]),
    requested.has("currencies")
      ? Currency.find({ isActive: true }).select("code name symbol isBase").sort({ isBase: -1, code: 1 }).lean()
      : Promise.resolve([]),
  ]);

  return NextResponse.json({ departments, categories, currencies });
}
