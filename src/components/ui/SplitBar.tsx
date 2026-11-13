import { Building2, Wallet } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { Dot } from "@/components/ui/Badge";
import { formatBaseCurrency } from "@/lib/currency";

interface SplitBarProps {
  /** Company-paid amount (base currency). */
  company: number;
  /** Paid-from-pocket amount (base currency). */
  pocket: number;
  /** Amount formatter; defaults to formatBaseCurrency. */
  format?: (amount: number) => string;
  /** "detail": two-column legend with icons; "inline": one compact row; "none". */
  legend?: "detail" | "inline" | "none";
  /** Bar thickness: sm 8px, md 14px. */
  size?: "sm" | "md";
  className?: string;
}

function percent(part: number, total: number) {
  return total > 0 ? (part / total) * 100 : 0;
}

/** Company (indigo) vs pocket (amber) share of spend, with a legend. */
export default function SplitBar({
  company,
  pocket,
  format = formatBaseCurrency,
  legend = "detail",
  size = "md",
  className,
}: SplitBarProps) {
  const total = company + pocket;
  const companyPct = percent(company, total);
  const pocketPct = percent(pocket, total);
  const pct = (n: number) => `${n.toFixed(1)}%`;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div
        role="img"
        aria-label={`Company paid ${pct(companyPct)}, pocket ${pct(pocketPct)}`}
        className={cn("flex gap-0.5 overflow-hidden bg-sunk", size === "sm" ? "h-2 rounded" : "h-3.5 rounded-[7px]")}
      >
        {company > 0 && <div className="bg-ramp" style={{ width: `${companyPct}%` }} />}
        {pocket > 0 && <div className="flex-1 bg-pocket" />}
      </div>

      {legend === "inline" && (
        <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-ink-2">
          <span className="inline-flex items-center gap-1.5">
            <Dot tone="accent" />
            Company <span className="num">{format(company)}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Dot tone="amber" />
            Pocket <span className="num">{format(pocket)}</span>
          </span>
        </div>
      )}

      {legend === "detail" && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(170px,100%),1fr))] gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="flex items-center gap-2 text-ink-2">
              <Building2 aria-hidden="true" size={16} strokeWidth={1.5} className="text-accent" />
              Company · {pct(companyPct)}
            </span>
            <span className="num whitespace-nowrap text-base font-medium">{format(company)}</span>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="flex items-center gap-2 text-ink-2">
              <Wallet aria-hidden="true" size={16} strokeWidth={1.5} className="text-amber" />
              Pocket · {pct(pocketPct)}
            </span>
            <span className="num whitespace-nowrap text-base font-medium">{format(pocket)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
