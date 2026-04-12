import { NextRequest, NextResponse } from "next/server";
import { verifyAndCreateUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();
    if (!token) {
      return NextResponse.json({ error: "Token required" }, { status: 400 });
    }

    const result = await verifyAndCreateUser(token);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ user: result.user, isNew: result.isNew });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
