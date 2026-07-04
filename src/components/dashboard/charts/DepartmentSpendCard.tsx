"use client";

import { Building2 } from "lucide-react";
import { formatBaseCurrency } from "@/lib/currency";
import { useChartColors } from "./chartTheme";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

interface DepartmentSpendDatum {
  _id?: string | null;
  name: string;
  total: number;
  count: number;
}

interface DepartmentSpendCardProps {
  data: DepartmentSpendDatum[];
  dense?: boolean;
}

export function DepartmentSpendCard({ data, dense = false }: DepartmentSpendCardProps) {
  const chartColors = useChartColors();

  return (
    <div className="card flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-line px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 p-2 text-white shadow-sm">
            <Building2 className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">Department Spend</h2>
            <p className="text-xs text-muted-foreground">Top spending departments</p>
          </div>
        </div>
      </div>
      <div className={`flex-1 ${dense ? "p-4" : "p-4 sm:p-6"}`}>
        {data.length > 0 ? (
          <div className={`${dense ? "h-[210px]" : "h-[300px]"} w-full`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} vertical={false} />
                <XAxis
                  dataKey="name"
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
                  cursor={{ fill: chartColors.grid, opacity: 0.4 }}
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
                <Bar
                  dataKey="total"
                  fill="#8b5cf6"
                  radius={[6, 6, 0, 0]}
                  barSize={40}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-100 to-fuchsia-100 dark:from-violet-500/20 dark:to-fuchsia-500/20">
              <Building2 className="h-6 w-6 text-violet-500 dark:text-violet-400" />
            </div>
            <p className="text-sm font-semibold text-foreground">No department data</p>
          </div>
        )}
      </div>
    </div>
  );
}
