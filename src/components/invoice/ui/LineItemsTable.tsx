"use client";

import { Plus, Trash2 } from "lucide-react";
import Button, { IconButton } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { inputClass, panelPadX } from "@/components/ui/styles";
import { formatRupees, lineItemAmount } from "@/lib/invoice";

export interface LineRow {
  /** Stable React key, so removing a row doesn't shift focus or state onto its neighbour. */
  id: string;
  description: string;
  quantity: string;
  rate: string;
}

let nextRowId = 0;
export const newLineRow = (): LineRow => ({ id: `line-${++nextRowId}`, description: "", quantity: "1", rate: "" });

interface LineItemsTableProps {
  rows: LineRow[];
  onChange: (index: number, patch: Partial<LineRow>) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}

/**
 * Columns: # · description · qty · rate · amount · remove. Description takes
 * all the free width; the number columns are sized for their largest figures
 * (qty "1000.5", rate "10000000.00", amount up to "₹1,00,00,00,000.00" and
 * growing past that rather than running under the remove button).
 * Below 640px of table width each row stacks into a small two-column card
 * (container query).
 */
const rowGrid = cn(
  "grid grid-cols-2 gap-x-3 gap-y-2 [grid-template-areas:'idx_del'_'desc_desc'_'qty_rate'_'amt_amt']",
  "[@container(min-width:640px)]:grid-cols-[1.5rem_minmax(0,1fr)_5.5rem_8rem_minmax(9.5rem,auto)_2.75rem]",
  "[@container(min-width:640px)]:items-center",
  "[@container(min-width:640px)]:[grid-template-areas:'idx_desc_qty_rate_amt_del']"
);

const narrowOnly = "[@container(min-width:640px)]:hidden";
const numInput = cn(inputClass, "num text-right");

/** Editable ruled table of invoice line items with a live amount per row. */
export default function LineItemsTable({ rows, onChange, onAdd, onRemove }: LineItemsTableProps) {
  return (
    <div className="[container-type:inline-size]">
      <div
        aria-hidden="true"
        className={cn(rowGrid, "cap hidden border-y border-rule-2 bg-sunk py-2 text-ink-3 [@container(min-width:640px)]:grid", panelPadX)}
      >
        <span className="[grid-area:idx]">#</span>
        <span className="[grid-area:desc]">Description</span>
        <span className="text-right [grid-area:qty]">Qty</span>
        <span className="text-right [grid-area:rate]">Rate (₹)</span>
        <span className="text-right [grid-area:amt]">Amount</span>
      </div>

      <ol>
        {rows.map((row, i) => {
          const n = i + 1;
          const amount = lineItemAmount(parseFloat(row.quantity) || 0, parseFloat(row.rate) || 0);
          return (
            <li
              key={row.id}
              className={cn(rowGrid, "border-b border-rule-2 py-3 [@container(min-width:640px)]:py-2", panelPadX)}
            >
              <span className="cap self-center text-ink-3 [grid-area:idx]">
                <span className={narrowOnly}>Item </span>
                <span className="num">{n}</span>
              </span>
              <input
                type="text"
                value={row.description}
                onChange={(e) => onChange(i, { description: e.target.value })}
                placeholder="Description"
                aria-label={`Item ${n} description`}
                className={cn(inputClass, "[grid-area:desc]")}
              />
              <input
                type="number"
                min="0"
                step="any"
                value={row.quantity}
                onChange={(e) => onChange(i, { quantity: e.target.value })}
                placeholder="Qty"
                aria-label={`Item ${n} quantity`}
                className={cn(numInput, "[grid-area:qty]")}
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={row.rate}
                onChange={(e) => onChange(i, { rate: e.target.value })}
                placeholder="Rate"
                aria-label={`Item ${n} rate in rupees`}
                className={cn(numInput, "[grid-area:rate]")}
              />
              <span className="flex items-baseline justify-between gap-2 [grid-area:amt] [@container(min-width:640px)]:justify-end">
                <span className={cn("cap text-ink-3", narrowOnly)}>Amount</span>
                <span className="num whitespace-nowrap text-sm font-medium text-ink">{formatRupees(amount)}</span>
              </span>
              <IconButton
                icon={Trash2}
                variant="ghost-danger"
                aria-label={`Remove item ${n}`}
                onClick={() => onRemove(i)}
                disabled={rows.length === 1}
                className="justify-self-end [grid-area:del]"
              />
            </li>
          );
        })}
      </ol>

      <div className={cn("pt-3", panelPadX)}>
        <Button variant="ghost" size="sm" icon={Plus} onClick={onAdd} className="-ml-3">
          Add item
        </Button>
      </div>
    </div>
  );
}
