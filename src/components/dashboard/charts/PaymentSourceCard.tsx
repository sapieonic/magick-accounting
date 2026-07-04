"use client";

import { CreditCard } from "lucide-react";
import { formatBaseCurrency } from "@/lib/currency";
import { useChartColors } from "./chartTheme";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";

interface PaymentSourceDatum {
  name: string;
  total: number;
  count: number;
}

interface PaymentSourceCardProps {
  data: PaymentSourceDatum[];
  dense?: boolean;
}

export function PaymentSourceCard({ data, dense = false }: PaymentSourceCardProps) {
  const chartColors = useChartColors();

  return (
    <div className="card flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-line px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 p-2 text-white shadow-sm">
            <CreditCard className="h-4 w-4" />
          </div>
          <h2 className="text-base font-bold text-foreground">Payment Source</h2>
        </div>
      </div>
      <div className={`flex-1 ${dense ? "p-4" : "p-6"}`}>
        {data.length > 0 ? (
          <div className="flex h-full flex-col">
            <div className={`relative ${dense ? "h-40" : "h-48"} w-full`}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="total"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={dense ? 46 : 55}
                    outerRadius={dense ? 72 : 85}
                    paddingAngle={3}
                    stroke={chartColors.pieStroke}
                    strokeWidth={2}
                    cornerRadius={4}
                  >
                    {data.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={entry.name === "company" ? "#10b981" : "#f59e0b"}
                        className="transition-all duration-300 hover:opacity-80"
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
                    formatter={(value: any, _name: any, item: any) => {
                      const numericValue = typeof value === "number" ? value : Number(value);
                      return [<span key="val" className="font-bold">{formatBaseCurrency(numericValue)}</span>, item.payload.name === "company" ? "Company Card" : "Out of Pocket"];
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-6 flex-1 space-y-3 pr-2">
              {data.map((c) => {
                const isCompany = c.name === "company";
                return (
                  <div
                    key={c.name}
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5"
                  >
                    <span
                      className="h-3 w-3 flex-shrink-0 rounded-full"
                      style={{ background: isCompany ? "#10b981" : "#f59e0b" }}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-muted-foreground">
                      {isCompany ? "Company Card" : "Out of Pocket"}
                    </span>
                    <span className="font-display text-sm font-bold tabular-nums text-foreground">
                      {formatBaseCurrency(c.total)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-500/20 dark:to-teal-500/20">
              <CreditCard className="h-6 w-6 text-emerald-500 dark:text-emerald-400" />
            </div>
            <p className="text-sm font-semibold text-foreground">No payment data</p>
          </div>
        )}
      </div>
    </div>
  );
}
