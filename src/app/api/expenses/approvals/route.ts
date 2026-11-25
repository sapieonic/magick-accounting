import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, verifyAuth } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import {
  countPendingApprovals,
  parseBulkReviewRequest,
  reviewExpenses,
  type BulkReviewRequest,
} from "@/lib/approval-server";
import { notifyReviewOutcome } from "@/lib/approval-notify";

/** The review queue's size: `{ pendingCount, pendingAmount, oldestPendingAt }`. Admins only. */
export async function GET(req: NextRequest) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;
  const denied = requireAdmin(authResult);
  if (denied) return denied;

  await connectDB();
  return NextResponse.json(await countPendingApprovals());
}

/**
 * Approve or reject several pending expenses at once. Body:
 * `{ action, items: { id, revision }[], reason? }`. Each expense succeeds or
 * fails on its own: `{ done: string[], failed: { id, code, error }[] }`.
 */
export async function POST(req: NextRequest) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;
  const denied = requireAdmin(authResult);
  if (denied) return denied;

  let request: BulkReviewRequest;
  try {
    request = parseBulkReviewRequest(await req.json().catch(() => null));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request is invalid";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  await connectDB();
  const { done, failed, reviewed } = await reviewExpenses({
    action: request.action,
    items: request.items,
    reason: request.reason,
    reviewer: authResult,
  });
  if (reviewed.length > 0) {
    await notifyReviewOutcome({
      action: request.action,
      expenses: reviewed,
      reason: request.reason,
      reviewer: authResult,
    });
  }
  return NextResponse.json({ done, failed });
}
