import { after, NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireAdmin, verifyAuth } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import {
  parseApprovalRequest,
  reopenExpense,
  resubmitExpense,
  reviewExpense,
  type ApprovalOutcome,
  type ApprovalRequest,
} from "@/lib/approval-server";
import { notifyReviewOutcome } from "@/lib/approval-notify";

/**
 * Approve or reject a pending expense, or move an approved or rejected one
 * back to review with `reopen` (admins, never on their own expense); or
 * resubmit a rejected one unchanged (its submitter). Body:
 * `{ action, revision, reason?, note? }`, where `revision` is the
 * `assetAllocationRevision` the client last saw.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await verifyAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ error: "Expense id is invalid" }, { status: 400 });
  }
  let request: ApprovalRequest;
  try {
    request = parseApprovalRequest(await req.json().catch(() => null));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request is invalid";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (request.action !== "resubmit") {
    const denied = requireAdmin(authResult);
    if (denied) return denied;
  }

  await connectDB();
  let outcome: ApprovalOutcome;
  if (request.action === "resubmit") {
    outcome = await resubmitExpense({
      id,
      revision: request.revision,
      note: request.note,
      user: authResult,
    });
  } else if (request.action === "reopen") {
    outcome = await reopenExpense({
      id,
      revision: request.revision,
      note: request.note,
      reviewer: authResult,
    });
  } else {
    outcome = await reviewExpense({
      id,
      action: request.action,
      revision: request.revision,
      reason: request.action === "reject" ? request.reason : null,
      reviewer: authResult,
    });
  }

  if (!outcome.ok) {
    const { status, code, error, approvalStatus } = outcome;
    return NextResponse.json(
      { error, code, ...(approvalStatus ? { approvalStatus } : {}) },
      { status }
    );
  }

  if (request.action !== "resubmit") {
    // Sent after the response: the decision is already saved, and a slow
    // Telegram must not make the admin think it failed.
    const expense = outcome.expense;
    after(() =>
      notifyReviewOutcome({
        action: request.action,
        expenses: [expense],
        reason:
          request.action === "reject" ? request.reason : request.action === "reopen" ? request.note : null,
        reviewer: authResult,
      })
    );
  }
  return NextResponse.json({ expense: outcome.expense });
}
