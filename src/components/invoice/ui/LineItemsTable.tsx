"use client";

import { Plus, Trash2 } from "lucide-react";
import Button, { IconButton } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { inputClass } from "@/components/ui/styles";
import { formatRupees, lineItemAmount } from "@/lib/invoice";

export interface LineRow {
  description: string;
  quantity: string;
  rate: string;
}

export const newLineRow = (): LineRow => ({ description: "", quantity: "1", rate: "" });

interface LineItemsTableProps {
  rows: LineRow[];
  onChange: (index: number, patch: Partial<LineRow>) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}

const pad = "px-[clamp(16px,2vw,24px)]";

/**
 * Columns: # · description · qty · rate · amount · remove. Below 560px of
 * table width each row stacks into a small two-column card (container query).
 */
const rowGrid = cn(
  "grid grid-cols-2 gap-x-3 gap-y-2 [grid-template-areas:'idx_del'_'desc_desc'_'qty_rate'_'amt_amt']",
  "[@container_(min-width:560px)]:grid-cols-[2rem_minmax(0,1fr)_5.5rem_8.5rem_8.5rem_2.75rem]",
  "[@container_(min-width:560px)]:items-center",
  "[@container_(min-width:560px)]:[grid-template-areas:'idx_desc_qty_rate_amt_del']"
);

const narrowOnly = "[@container_(min-width:560px)]:hidden";
const numInput = cn(inputClass, "num text-right");

/** Editable ruled table of invoice line items with a live amount per row. */
export default function LineItemsTable({ rows, onChange, onAdd, onRemove }: LineItemsTableProps) {
  return (
    <div className="[container-type:inline-size]">
      <div
        aria-hidden="true"
        className={cn(rowGrid, "cap hidden border-y border-rule-2 bg-sunk py-2 text-ink-3 [@container_(min-width:560px)]:grid", pad)}
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
              key={i}
              className={cn(rowGrid, "border-b border-rule-2 py-3 [@container_(min-width:560px)]:py-2", pad)}
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
              <span className="flex items-baseline justify-between gap-2 [grid-area:amt] [@container_(min-width:560px)]:justify-end">
                <span className={cn("cap text-ink-3", narrowOnly)}>Amount</span>
                <span className="num whitespace-nowrap text-sm font-medium text-ink">{formatRupees(amount)}</span>
              </span>
              <IconButton
                icon={Trash2}
                aria-label={`Remove item ${n}`}
                onClick={() => onRemove(i)}
                disabled={rows.length === 1}
                className="justify-self-end hover:text-danger [grid-area:del]"
              />
            </li>
          );
        })}
      </ol>

      <div className={cn("pt-3", pad)}>
        <Button variant="ghost" size="sm" icon={Plus} onClick={onAdd} className="-ml-3">
          Add item
        </Button>
      </div>
    </div>
  );
}
