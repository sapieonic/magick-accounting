/** Response shapes of /api/dashboard/stats and /api/dashboard/charts. */

export interface RecentExpense {
  _id: string;
  title: string;
  amount: number;
  amountInBaseCurrency?: number;
  currency?: { code: string; symbol: string; isBase: boolean };
  date: string;
  category?: { name: string } | null;
  department?: { name: string } | null;
}

export interface OverviewStats {
  totalExpenses: number;
  totalAmount: number;
  departmentCount: number;
  categoryCount: number;
  /** The caller's own five latest expenses. */
  recentExpenses: RecentExpense[];
}

export interface MonthPoint {
  /** Short month label, e.g. "Oct". */
  month: string;
  /** "YYYY-MM", also the Expenses page `month` filter value. */
  key: string;
  total: number;
  count: number;
}

export interface SpendRow {
  _id?: string | null;
  name: string;
  total: number;
  count: number;
}

export interface OverviewCharts {
  /** Last six months, oldest first; the last one is the current (partial) month. */
  monthlyTrend: MonthPoint[];
  topCategories: SpendRow[];
  paymentSources: Array<{ name: string; total: number; count: number }>;
  departmentSpend: SpendRow[];
}
