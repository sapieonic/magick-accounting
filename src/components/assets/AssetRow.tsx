import Link from "next/link";
import { format } from "date-fns";
import { Download } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { IconButton } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { rowClass } from "@/components/ui/styles";
import AssetGlyph from "@/components/assets/AssetGlyph";
import AssetStatusBadge from "@/components/assets/AssetStatusBadge";

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

// The list is a container: 6 columns when it is wide, title block · value · receipt when narrow.
const grid = cn(
  "grid grid-cols-[minmax(0,1fr)_auto_40px] items-center gap-x-4 px-4",
  "[@container(min-width:760px)]:grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,1.5fr)_112px_minmax(120px,auto)_40px]"
);
const wide = "hidden [@container(min-width:760px)]:block";
const narrow = "[@container(min-width:760px)]:hidden";
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
  const purchaseDate = format(new Date(purchase.date), "dd MMM yyyy");
  const assignee = asset.assignedTo?.name || "Unassigned";
  const hasValue = asset.canViewFinancials && asset.bookValue != null && asset.capitalizedCost != null;

  return (
    <li className={cn(rowClass, grid, "relative min-h-[64px] py-2.5")}>
      <div className="flex min-w-0 items-center gap-3">
        <AssetGlyph category={asset.assetCategory} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <Link
            href={`/dashboard/assets/${asset._id}`}
            className="ell font-medium text-ink after:absolute after:inset-0 after:content-[''] hover:text-accent"
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
            <span className="num whitespace-nowrap text-xs text-ink-3">
              Cost {formatCurrency(asset.capitalizedCost!, currencyCode)}
            </span>
          </>
        ) : (
          <span className="text-xs text-ink-3">Restricted</span>
        )}
        <AssetStatusBadge status={asset.status} className={narrow} />
      </div>

      <div className="relative z-10 flex justify-end">
        {!purchase.receiptKey ? (
          <span className="text-xs text-ink-3" title="No receipt">
            <span aria-hidden="true">—</span>
            <span className="sr-only">No receipt</span>
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
