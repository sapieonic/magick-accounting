"use client";

import clsx from "clsx";

export default function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={clsx("animate-pulse rounded-lg bg-subtle dark:bg-subtle-hover/50", className)}
      aria-hidden="true"
    />
  );
}

/** Header + stacked row placeholders for list pages (expenses, categories, users...). */
export function ListPageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="animate-fade-in space-y-6" role="status" aria-label="Loading content">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-36" />
      </div>
      <Skeleton className="h-14 w-full max-w-sm" />
      <div className="space-y-2.5">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-[72px] w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

/** Placeholder mirroring the expenses page: summary bar, filter card, expense rows. */
export function ExpenseListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="animate-fade-in space-y-6" role="status" aria-label="Loading expenses">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-10 w-36" />
      </div>
      <Skeleton className="h-[68px] w-full max-w-md rounded-xl" />
      <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        </div>
      </div>
      <div className="space-y-2.5">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-[76px] w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

/** Placeholder mirroring the dashboard: hero, stat cards, charts, recent list. */
export function DashboardSkeleton() {
  return (
    <div className="animate-fade-in space-y-6" role="status" aria-label="Loading dashboard">
      <Skeleton className="h-[120px] w-full rounded-2xl" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[84px] rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <Skeleton className="h-[340px] rounded-xl lg:col-span-3" />
        <Skeleton className="h-[340px] rounded-xl lg:col-span-2" />
      </div>
      <Skeleton className="h-[280px] w-full rounded-xl" />
    </div>
  );
}

/** Placeholder for the expense create/edit form card. */
export function FormSkeleton() {
  return (
    <div className="animate-fade-in" role="status" aria-label="Loading form">
      <div className="mb-6 space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-7 w-44" />
      </div>
      <div className="card mx-auto max-w-2xl space-y-5 p-6">
        <Skeleton className="h-10 w-full" />
        <div className="grid gap-5 sm:grid-cols-3">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}
