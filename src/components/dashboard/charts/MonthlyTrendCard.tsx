"use client";

import { BarChart3 } from "lucide-react";
import { formatBaseCurrency } from "@/lib/currency";
import { useChartColors } from "./chartTheme";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

interface MonthlyTrendDatum {
  month: string;
  key: string;
  total: number;
  count: number;
}

interface MonthlyTrendCardProps {
  data: MonthlyTrendDatum[];
  dense?: boolean;
  onSelectMonth?: (key: string) => void;
}

export function MonthlyTrendCard({ data, dense = false, onSelectMonth }: MonthlyTrendCardProps) {
  const chartColors = useChartColors();
  const hasTrendData = data.some((m) => m.total > 0);

  return (
    <div className="card flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-line px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 p-2 text-white shadow-sm">
            <BarChart3 className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">Monthly Trend</h2>
            <p className="text-xs text-muted-foreground">Last 6 months overview</p>
          </div>
        </div>
      </div>
      <div className={`flex-1 ${dense ? "p-4" : "p-4 sm:p-6"}`}>
        {hasTrendData ? (
          <div className={`${dense ? "h-[210px]" : "h-[300px]"} w-full`}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={data}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                onClick={(state: any) => {
                  const key = state?.activePayload?.[0]?.payload?.key;
                  if (key && onSelectMonth) onSelectMonth(key);
                }}
              >
                <defs>
                  <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} vertical={false} />
                <XAxis
                  dataKey="month"
                  stroke={chartColors.axis}
                  tick={{ fontSize: 12, fill: chartColors.axis }}
                  tickLine={false}
                  axisLine={false}
                  dy={10}
                />
                <YAxis
                  stroke={chartColors.axis}
                  tick={{ fontSize: 12, fill: chartColors.axis }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) =>
                    v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `${v}`
                  }
                />
                <Tooltip
                  cursor={{ stroke: chartColors.axis, strokeWidth: 1, strokeDasharray: "4 4" }}
                  contentStyle={{
                    borderRadius: "16px",
                    backgroundColor: chartColors.tooltipBg,
                    border: `1px solid ${chartColors.tooltipBorder}`,
                    boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)",
                    fontSize: "13px",
                    color: chartColors.tooltipText,
                    backdropFilter: "blur(12px)",
                  }}
                  formatter={(value: any, _name: any, item: any) => {
                    const numericValue = typeof value === "number" ? value : Number(value);
                    const count = item?.payload?.count ?? 0;
                    return [
                      <span key="val" className="font-bold">{formatBaseCurrency(numericValue)}</span>,
                      <span key="count" className="text-muted-foreground">{count} expenses</span>,
                    ];
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="#6366f1"
                  strokeWidth={3}
                  fill="url(#trendFill)"
                  activeDot={{ r: 6, strokeWidth: 0, fill: "#6366f1" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-500/20 dark:to-indigo-500/20">
              <BarChart3 className="h-6 w-6 text-blue-500 dark:text-blue-400" />
            </div>
            <p className="text-sm font-semibold text-foreground">No trend data yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Add your first expense to generate insights.</p>
          </div>
        )}
      </div>
    </div>
  );
}
