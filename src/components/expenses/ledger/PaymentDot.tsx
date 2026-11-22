import { Building2, Wallet } from "lucide-react";
import type { ExpenseListItem } from "@/types/expense";
import { cn } from "@/components/ui/cn";
import { ICON_STROKE } from "@/components/ui/styles";

type Kind = "company" | "pocket" | "both";

/**
 * Company money, pocket money, or both. A "several people" expense follows
 * its entries, so an all-pocket bill reads as pocket even though more than
 * one person paid.
 */
function paymentMark(expense: ExpenseListItem): { kind: Kind; label: string } {
  if (expense.paymentSource === "split") return { kind: "both", label: "Split" };
  if (expense.paymentSource === "multiple") {
    const sources = new Set(expense.payments?.map((entry) => entry.source));
    const pocket = sources.has("pocket");
    const company = sources.has("company");
    if (pocket && company) return { kind: "both", label: "Company and pocket" };
    if (company) return { kind: "company", label: "Company account" };
    return { kind: "pocket", label: "Pocket" };
  }
  if (expense.paymentSource === "company") return { kind: "company", label: "Company account" };
  return { kind: "pocket", label: "Pocket" };
}

/**
 * The payment-source mark: a building for the company account, a wallet for
 * pocket, and both when the bill is split. Same icons as the expense form,
 * small enough to sit in a ledger sub-line.
 */
export default function PaymentDot({
  expense,
  decorative = false,
  className,
}: {
  expense: ExpenseListItem;
  /** The words beside it already name the source, so the mark stays visual. */
  decorative?: boolean;
  className?: string;
}) {
  const { kind, label } = paymentMark(expense);
  return (
    <span
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative ? true : undefined}
      title={label}
      className={cn(
        "inline-flex h-4 shrink-0 items-center justify-center rounded-full",
        kind === "both" ? "gap-0.5 bg-sunk px-1" : "w-4",
        kind === "company" && "bg-accent-soft text-accent",
        kind === "pocket" && "bg-amber-soft text-amber",
        className
      )}
    >
      {kind !== "pocket" && (
        <Building2 aria-hidden="true" size={12} strokeWidth={ICON_STROKE} className={kind === "both" ? "text-accent" : undefined} />
      )}
      {kind !== "company" && (
        <Wallet aria-hidden="true" size={12} strokeWidth={ICON_STROKE} className={kind === "both" ? "text-amber" : undefined} />
      )}
    </span>
  );
}
