"use client";

import Link from "next/link";
import { ArrowUpRight, LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  gradient: string;
  bgGlow: string;
  href: string;
}

export function StatCard({ label, value, icon: Icon, gradient, bgGlow, href }: StatCardProps) {
  return (
    <Link
      href={href}
      className="group relative overflow-hidden rounded-2xl border border-line bg-surface/80 p-5 shadow-sm backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-line-strong hover:shadow-elevated dark:bg-surface/50 dark:shadow-black/40"
    >
      <div
        className={`absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100 ${bgGlow}`}
      />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} text-white shadow-lg shadow-black/10 transition-transform duration-300 group-hover:scale-110 sm:h-14 sm:w-14`}
        >
          <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
        </div>
        <div className="flex-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {label}
          </p>
          <p className="font-display mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {value}
          </p>
        </div>
        <div className="absolute right-5 top-5 sm:static sm:right-auto sm:top-auto">
          <ArrowUpRight className="h-5 w-5 text-line-strong transition-all duration-300 group-hover:translate-x-1 group-hover:-translate-y-1 group-hover:text-foreground" />
        </div>
      </div>
    </Link>
  );
}
