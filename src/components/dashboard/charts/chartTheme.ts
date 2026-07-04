"use client";

import { useMemo } from "react";
import { useTheme } from "@/contexts/ThemeContext";

export const PIE_COLORS = [
  "#6366f1", // indigo (brand)
  "#22d3ee", // cyan (accent)
  "#a855f7", // purple
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ec4899", // pink
];

export interface ChartColors {
  grid: string;
  axis: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  pieStroke: string;
}

export function useChartColors(): ChartColors {
  const { theme } = useTheme();
  return useMemo(() => {
    const isDark = theme === "dark";
    return {
      grid: isDark ? "#27272a" : "#e2e8f0",
      axis: "#94a3b8",
      tooltipBg: isDark ? "rgba(24, 24, 27, 0.85)" : "rgba(255, 255, 255, 0.85)",
      tooltipBorder: isDark ? "#3f3f46" : "#e2e8f0",
      tooltipText: isDark ? "#fafafa" : "#0f172a",
      pieStroke: isDark ? "#18181b" : "#ffffff",
    };
  }, [theme]);
}
