import { CircleCheck, CircleX, Clock3, type LucideIcon } from "lucide-react";
import Badge, { type Tone } from "@/components/ui/Badge";
import { APPROVAL_LABEL, effectiveApprovalStatus, type ApprovalStatus } from "@/lib/approval";

const STYLE: Record<ApprovalStatus, { tone: Tone; icon: LucideIcon }> = {
  // Neutral, not amber: amber means pocket/owed in Ledger.
  pending: { tone: "neutral", icon: Clock3 },
  approved: { tone: "success", icon: CircleCheck },
  rejected: { tone: "danger", icon: CircleX },
};

interface ApprovalBadgeProps {
  status?: ApprovalStatus | null;
  /** Rows only flag what isn't approved; set to also show "Approved" (the expense detail). */
  showApproved?: boolean;
  className?: string;
}

/** An expense's approval state as icon + plain-language text. Missing status = legacy = approved. */
export default function ApprovalBadge({ status, showApproved = false, className }: ApprovalBadgeProps) {
  const effective = effectiveApprovalStatus({ approvalStatus: status });
  if (effective === "approved" && !showApproved) return null;
  const { tone, icon } = STYLE[effective];
  return (
    <Badge tone={tone} icon={icon} className={className}>
      {APPROVAL_LABEL[effective]}
    </Badge>
  );
}
