import Link from "next/link";
import { Download } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { IconButton } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { panelPadL, rowClass } from "@/components/ui/styles";
import AssetGlyph from "@/components/assets/AssetGlyph";
import AssetStatusBadge from "@/components/assets/AssetStatusBadge";
import { expenseDate } from "@/components/expenses/ledger/format";

export interface AssetListItem {
  _id: string;
  assetTag: string;
  name: string;
  assetCategory: string;
  serialNumber: string;
  make: string;
  assetModel: string;
  status: string;
  capitalizedCost?: number;
  bookValue?: number;
  canViewFinancials: boolean;
  depreciationMethod?: string;
  depreciationRate?: number;
  assignedTo?: { _id: string; name: string; email: string } | null;
  department: { _id: string; name: string };
  purchaseExpense: {
    _id: string;
    title: string;
    date: string;
    receiptKey?: string;
    receiptFilename?: string;
    currency?: { code: string; symbol: string };
  };
}

// The list is a container: 6 columns when it is wide, title block · book value · receipt when
// narrow (cost and status then join the title block, so the name keeps its room).
// Panel side padding on the left; the trailing receipt button sits closer to the edge.
const grid = cn(
  "grid grid-cols-[minmax(0,1fr)_auto_40px] items-center gap-x-4 pr-2 sm:pr-3",
  panelPadL,
  "[@container(min-width:760px)]:grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,1.5fr)_112px_minmax(120px,auto)_40px]"
);
const wide = "hidden [@container(min-width:760px)]:block";
const narrow = "[@container(min-width:760px)]:hidden";
const narrowFlex = "flex [@container(min-width:760px)]:hidden";
const sub = "ell text-xs text-ink-3";

/** Column captions, shown only when the list is wide enough for columns. */
export function AssetListHead() {
  return (
    <div aria-hidden="true" className={cn(grid, "hidden bg-sunk py-2 text-ink-3 [@container(min-width:760px)]:grid")}>
      <span className="cap">Asset</span>
      <span className="cap">Assigned to</span>
      <span className="cap">Purchase</span>
      <span className="cap">Status</span>
      <span className="cap text-right">Book value</span>
      <span className="sr-only">Receipt</span>
    </div>
  );
}

interface AssetRowProps {
  asset: AssetListItem;
  openingReceipt: boolean;
  onOpenReceipt: (asset: AssetListItem) => void;
}

/** One ledger row; the asset name link covers the row, inner links/buttons sit above it. */
export default function AssetRow({ asset, openingReceipt, onOpenReceipt }: AssetRowProps) {
  const purchase = asset.purchaseExpense;
  const currencyCode = purchase.currency?.code || "INR";
  const purchaseDate = expenseDate(purchase, "d MMM yyyy");
  const assignee = asset.assignedTo?.name || "Unassigned";
  const hasValue = asset.canViewFinancials && asset.bookValue != null && asset.capitalizedCost != null;

  return (
    <li className={cn(rowClass, grid, "relative min-h-[64px] py-2.5")}>
      <div className="flex min-w-0 items-center gap-3">
        <AssetGlyph category={asset.assetCategory} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <Link
            href={`/dashboard/assets/${asset._id}`}
            className="line-clamp-2 break-words font-medium text-ink after:absolute after:inset-0 after:content-[''] hover:text-accent"
          >
            {asset.name}
          </Link>
          <span className={sub}>
            <span className="num text-accent">{asset.assetTag}</span> · {asset.assetCategory}
            {asset.serialNumber ? ` · S/N ${asset.serialNumber}` : ""}
          </span>
          <span className={cn(sub, narrow)}>
            {assignee} · <span className="num">{purchaseDate}</span>
          </span>
          <span className={cn("mt-0.5 min-w-0 flex-wrap items-center gap-x-2 gap-y-1", narrowFlex)}>
            <AssetStatusBadge status={asset.status} />
            {hasValue && (
              <span className="num whitespace-nowrap text-xs text-ink-3">
                Cost {formatCurrency(asset.capitalizedCost!, currencyCode)}
              </span>
            )}
          </span>
        </div>
      </div>

      <div className={cn(wide, "min-w-0")}>
        <p className={cn("ell text-sm", asset.assignedTo ? "text-ink" : "text-ink-3")}>{assignee}</p>
        <p className={sub}>{asset.department?.name}</p>
      </div>

      <div className={cn(wide, "min-w-0")}>
        {asset.canViewFinancials ? (
          <Link
            href={`/dashboard/expenses/${purchase._id}/edit`}
            className="ell relative z-10 block text-sm text-ink-2 hover:text-accent"
          >
            {purchase.title}
          </Link>
        ) : (
          <p className="ell text-sm text-ink-2">{purchase.title}</p>
        )}
        <p className="num text-xs text-ink-3">{purchaseDate}</p>
      </div>

      <div className={wide}>
        <AssetStatusBadge status={asset.status} />
      </div>

      <div className="flex flex-col items-end gap-1 text-right">
        {hasValue ? (
          <>
            <span className="num whitespace-nowrap font-medium text-ink">
              {formatCurrency(asset.bookValue!, currencyCode)}
            </span>
            <span className={cn("num whitespace-nowrap text-xs text-ink-3", wide)}>
              Cost {formatCurrency(asset.capitalizedCost!, currencyCode)}
            </span>
          </>
        ) : (
          <span className="text-xs text-ink-3">Restricted</span>
        )}
      </div>

      <div className="relative z-10 flex justify-end">
        {!purchase.receiptKey ? (
          // Without financials the API withholds the receipt too: it may well exist.
          <span className="text-xs text-ink-3" title={asset.canViewFinancials ? "No receipt" : "Receipt restricted"}>
            <span aria-hidden="true">—</span>
            <span className="sr-only">{asset.canViewFinancials ? "No receipt" : "Receipt restricted"}</span>
          </span>
        ) : (
          <IconButton
            size="sm"
            icon={Download}
            loading={openingReceipt}
            aria-label={`Open receipt for ${asset.name}`}
            onClick={() => onOpenReceipt(asset)}
          />
        )}
      </div>
    </li>
  );
}
