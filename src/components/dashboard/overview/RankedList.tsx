import Link from "next/link";
import type { ReactNode } from "react";
import RankedBar, { type RankedBarTone } from "@/components/ui/RankedBar";
import { cn } from "@/components/ui/cn";
import { focusRing, transition } from "@/components/ui/styles";
import { formatBaseCurrency } from "@/lib/currency";
import { percentOf } from "./format";

export interface RankedItem {
  key: string;
  label: string;
  /** Base-currency total. */
  total: number;
  /** Opens the matching expenses; rows without one are static. */
  href?: string;
  leading?: ReactNode;
  tone?: RankedBarTone;
}

interface RankedListProps {
  items: RankedItem[];
  /** The whole the share percentages are taken of. */
  whole: number;
}

/** Ranked spend rows (bars scaled to the largest), each optionally a link. */
export default function RankedList({ items, whole }: RankedListProps) {
  const max = Math.max(0, ...items.map((item) => item.total));
  return (
    <ul className="-mx-2 flex flex-col">
      {items.map((item) => {
        const bar = (
          <RankedBar
            label={item.label}
            amount={formatBaseCurrency(item.total)}
            ratio={max > 0 ? item.total / max : 0}
            share={percentOf(item.total, whole)}
            leading={item.leading}
            tone={item.tone}
          />
        );
        const rowClass = "block rounded-control px-2 py-2";
        return (
          <li key={item.key}>
            {item.href ? (
              <Link href={item.href} className={cn(rowClass, "hover:bg-hover", transition, focusRing)}>
                {bar}
              </Link>
            ) : (
              <div className={rowClass}>{bar}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
