"use client";

import { PieChart as PieChartIcon } from "lucide-react";
import { formatBaseCurrency } from "@/lib/currency";
import { PIE_COLORS, useChartColors } from "./chartTheme";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";

interface TopCategoryDatum {
  _id?: string | null;
  name: string;
  total: number;
  count: number;
}

interface TopCategoriesCardProps {
  data: TopCategoryDatum[];
  dense?: boolean;
  onSelectCategory?: (id?: string | null) => void;
}

export function TopCategoriesCard({ data, dense = false, onSelectCategory }: TopCategoriesCardProps) {
  const chartColors = useChartColors();
  const hasCategoryData = data.length > 0;
  const categoryTotal = data.reduce((sum, c) => sum + c.total, 0);

  const handleSelect = (id?: string | null) => {
    if (onSelectCategory) onSelectCategory(id);
  };

  return (
    <div className="card flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-line px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-gradient-to-br from-amber-500 to-pink-500 p-2 text-white shadow-sm">
            <PieChartIcon className="h-4 w-4" />
          </div>
          <h2 className="text-base font-bold text-foreground">Top Categories</h2>
        </div>
      </div>
      <div className={`flex-1 ${dense ? "p-4" : "p-6"}`}>
        {hasCategoryData ? (
          <div className="flex h-full flex-col">
            <div className={`relative ${dense ? "h-40" : "h-48"} w-full`}>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total</span>
                <span className="font-display text-xl font-bold text-foreground">
                  {formatBaseCurrency(categoryTotal)}
                </span>
              </div>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="total"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={dense ? 55 : 65}
                    outerRadius={dense ? 72 : 85}
                    paddingAngle={3}
                    stroke={chartColors.pieStroke}
                    strokeWidth={2}
                    cornerRadius={4}
                    onClick={(entry: any) => handleSelect(entry?.payload?._id || entry?._id)}
                  >
                    {data.map((_, i) => (
                      <Cell
                        key={i}
                        fill={PIE_COLORS[i % PIE_COLORS.length]}
                        className="cursor-pointer transition-all duration-300 hover:opacity-80"
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: "12px",
                      backgroundColor: chartColors.tooltipBg,
                      border: `1px solid ${chartColors.tooltipBorder}`,
                      boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)",
                      fontSize: "13px",
                      color: chartColors.tooltipText,
                      backdropFilter: "blur(12px)",
                    }}
                    formatter={(value: any) => {
                      const numericValue = typeof value === "number" ? value : Number(value);
                      return [<span key="val" className="font-bold">{formatBaseCurrency(numericValue)}</span>, ""];
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-6 flex-1 space-y-2 overflow-y-auto pr-2">
              {data.map((c, i) => {
                return (
                  <button
                    key={c.name}
                    onClick={() => handleSelect(c._id)}
                    className="group flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-subtle"
                  >
                    <span
                      className="h-3 w-3 flex-shrink-0 rounded-full"
                      style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-muted-foreground group-hover:text-foreground">
                      {c.name}
                    </span>
                    <span className="font-display text-sm font-bold tabular-nums text-foreground">
                      {formatBaseCurrency(c.total)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-100 to-pink-100 dark:from-amber-500/20 dark:to-pink-500/20">
              <PieChartIcon className="h-6 w-6 text-pink-500 dark:text-pink-400" />
            </div>
            <p className="text-sm font-semibold text-foreground">No category data</p>
            <p className="mt-1 text-sm text-muted-foreground">Your top categories will appear here.</p>
          </div>
        )}
      </div>
    </div>
  );
}
