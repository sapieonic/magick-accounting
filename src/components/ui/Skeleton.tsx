"use client";

import { cn } from "@/components/ui/cn";

export default function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-control bg-sunk", className)} aria-hidden="true" />;
}

function HeaderSkeleton() {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      <Skeleton className="h-11 w-36" />
    </div>
  );
}

/** Rows of a ruled ledger panel. */
function RowsSkeleton({ rows, rowClass }: { rows: number; rowClass: string }) {
  return (
    <div className="overflow-hidden rounded-panel border border-rule bg-surface">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={cn("flex items-center gap-3 border-t border-rule-2 px-4 first:border-t-0", rowClass)}>
          <Skeleton className="h-7 w-7 shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

/** Header + stacked row placeholders for list pages (expenses, categories, users...). */
export function ListPageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="animate-fade-in space-y-6" role="status" aria-label="Loading content">
      <HeaderSkeleton />
      <Skeleton className="h-11 w-full max-w-sm" />
      <RowsSkeleton rows={rows} rowClass="h-[72px]" />
    </div>
  );
}

/** Placeholder mirroring the expenses page: header, filters, totals, ledger rows. */
export function ExpenseListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="animate-fade-in space-y-5" role="status" aria-label="Loading expenses">
      <HeaderSkeleton />
      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-11 flex-[3_1_240px]" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-11 flex-[1_1_140px]" />
        ))}
      </div>
      <RowsSkeleton rows={rows} rowClass="h-[58px]" />
    </div>
  );
}

/** Placeholder mirroring the overview: totals band, then a ruled sheet of panels. */
export function DashboardSkeleton() {
  return (
    <div className="animate-fade-in space-y-6" role="status" aria-label="Loading dashboard">
      <HeaderSkeleton />
      <div className="flex flex-wrap gap-px overflow-hidden rounded-panel border border-rule bg-rule">
        <div className="flex-[2_1_380px] space-y-3 bg-surface p-6">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-12 w-3/4" />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex-[1_1_220px] space-y-3 bg-surface p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-6 w-32" />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-px overflow-hidden rounded-panel border border-rule bg-rule">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex-[1_1_min(440px,100%)] space-y-4 bg-surface p-6">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-56 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Placeholder for the expense create/edit form. */
export function FormSkeleton() {
  return (
    <div className="animate-fade-in space-y-6" role="status" aria-label="Loading form">
      <HeaderSkeleton />
      <div className="space-y-5 rounded-panel border border-rule bg-surface p-6">
        <Skeleton className="h-11 w-full" />
        <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr))]">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-11" />
          ))}
        </div>
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}
