import Link from "next/link";
import { Plus, ReceiptText } from "lucide-react";
import Button from "@/components/ui/Button";
import CategoryGlyph from "@/components/ui/CategoryGlyph";
import EmptyState from "@/components/ui/EmptyState";
import { cn } from "@/components/ui/cn";
import { focusRing, panelPadX, rowClass } from "@/components/ui/styles";
import { formatBaseCurrency, formatCurrency } from "@/lib/currency";
import { expenseDate, isForeign } from "@/components/expenses/ledger/format";
import type { RecentExpense } from "./types";

/** Ledger rows for the caller's latest expenses; each opens it in the Expenses list. */
export default function LatestEntries({ expenses }: { expenses: RecentExpense[] }) {
  if (!expenses.length) {
    return (
      <EmptyState
        icon={<ReceiptText />}
        title="No expenses yet"
        description="Create your first expense to get started!"
        action={
          <Button icon={Plus} href="/dashboard/expenses/new">
            Add expense
          </Button>
        }
      />
    );
  }

  return (
    <ul className="flex flex-col">
      {expenses.map((expense) => {
        const meta = [expense.category?.name, expense.department?.name].filter(Boolean).join(" · ");
        return (
          <li key={expense._id}>
            <Link
              href={`/dashboard/expenses?expand=${expense._id}`}
              className={cn(
                rowClass,
                focusRing,
                panelPadX,
                "grid min-h-14 grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 py-2.5"
              )}
            >
              <CategoryGlyph name={expense.category?.name} />
              <span className="flex min-w-0 flex-col gap-px">
                <span className="ell font-medium text-ink">{expense.title}</span>
                <span className="ell text-xs text-ink-3">
                  {/* The stored calendar day, not the viewer's local reading of its UTC midnight. */}
                  <span className="num">{expenseDate(expense, "d MMM yyyy")}</span>
                  {meta && ` · ${meta}`}
                </span>
              </span>
              <span className="flex flex-col items-end">
                <span className="num whitespace-nowrap text-ink">
                  {formatCurrency(expense.amount, expense.currency?.code)}
                </span>
                {isForeign(expense) && (
                  <span className="num whitespace-nowrap text-xs text-ink-3">
                    {formatBaseCurrency(expense.amountInBaseCurrency!)}
                  </span>
                )}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
