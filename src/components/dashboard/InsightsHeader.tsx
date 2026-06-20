"use client";

import Link from "next/link";
import { Sparkles, Plus } from "lucide-react";
import { motion } from "framer-motion";

interface InsightsHeaderProps {
  userName?: string;
  insightsMessage?: string;
}

export function InsightsHeader({ userName, insightsMessage }: InsightsHeaderProps) {
  const firstName = userName?.split(" ")[0] || "there";

  return (
    <div className="relative flex flex-col gap-4 overflow-hidden rounded-3xl bg-gradient-to-br from-brand-900 via-brand-800 to-accent-900 px-6 py-6 text-white shadow-xl shadow-brand-900/20 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-8">
      {/* Background patterns */}
      <div className="bg-ledger-contrast absolute inset-0 opacity-20 mix-blend-overlay" />
      <div className="absolute -left-20 -top-20 h-64 w-64 rounded-full bg-brand-500/30 blur-[80px]" />
      <div className="absolute -bottom-32 -right-20 h-80 w-80 rounded-full bg-accent-500/20 blur-[100px]" />

      <div className="relative z-10 max-w-xl">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center gap-2"
        >
          <Sparkles className="h-5 w-5 text-accent-300" />
          <p className="text-xs font-semibold tracking-wide text-accent-100 uppercase">
            Magick Insights
          </p>
        </motion.div>
        
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="font-display mt-2 text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl"
        >
          Welcome back, {firstName}.
        </motion.h1>
        
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-2 text-sm text-brand-100/80 sm:text-base"
        >
          {insightsMessage || "Here's an overview of your expenses and top categories."}
        </motion.p>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="relative z-10 flex shrink-0 items-center gap-3"
      >
        <Link
          href="/dashboard/expenses/new"
          className="group flex items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur-md transition-all hover:bg-white/20 hover:shadow-lg hover:shadow-black/10 active:scale-95"
        >
          <Plus className="h-5 w-5 transition-transform group-hover:rotate-90" />
          <span>New Expense</span>
        </Link>
      </motion.div>
    </div>
  );
}
