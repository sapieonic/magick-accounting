import { Dot } from "@/components/ui/Badge";
import { cn } from "@/components/ui/cn";
import { getPaymentBreakdown } from "@/lib/expense";
import type { ExpenseListItem } from "@/types/expense";

/**
 * 7px dot for who paid: indigo company, amber pocket, half and half when an
 * expense was shared between the two (split, or several payers).
 */
export default function PaymentDot({ expense, className }: { expense: ExpenseListItem; className?: string }) {
  const { pocketBase, companyBase } = getPaymentBreakdown(expense);
  if (pocketBase > 0 && companyBase > 0) {
    return (
      <span aria-hidden="true" className={cn("inline-flex h-[7px] w-[7px] shrink-0 overflow-hidden rounded-full", className)}>
        <span className="w-1/2 bg-accent" />
        <span className="w-1/2 bg-pocket" />
      </span>
    );
  }
  return <Dot tone={pocketBase > 0 ? "amber" : "accent"} className={className} />;
}
