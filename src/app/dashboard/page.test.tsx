import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import DashboardPage from "./page";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { formatBaseCurrency } from "@/lib/currency";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
  },
}));

vi.mock("@/hooks/useTitle", () => ({
  useTitle: vi.fn(),
}));

const monthlyTrend = [
  { month: "Jun", key: "2026-06", total: 100, count: 1 },
  { month: "Jul", key: "2026-07", total: 0, count: 0 },
  { month: "Aug", key: "2026-08", total: 200, count: 2 },
  { month: "Sep", key: "2026-09", total: 0, count: 0 },
  { month: "Oct", key: "2026-10", total: 500, count: 1 },
  { month: "Nov", key: "2026-11", total: 300, count: 1 },
];

function mockApi(stats: Record<string, unknown>, charts: Record<string, unknown>, users: unknown[] = []) {
  vi.mocked(api.get).mockImplementation((url: string) => {
    if (url === "/api/dashboard/stats") return Promise.resolve(stats);
    if (url === "/api/dashboard/charts") return Promise.resolve(charts);
    if (url === "/api/users") return Promise.resolve({ users });
    return Promise.resolve({});
  });
}

const person = (id: string, name: string, pocketSpend: number) => ({
  _id: id,
  name,
  email: `${name.toLowerCase()}@example.com`,
  totalSpend: pocketSpend + 10,
  pocketSpend,
  companySpend: 10,
});

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ user: { name: "Test User" }, isAdmin: true } as any);
    // The trend's last bucket (2026-11) is the current month.
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-13T12:00:00Z") });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders totals, monthly bars, ranked categories/departments, who paid and latest entries", async () => {
    mockApi(
      {
        totalExpenses: 5,
        totalAmount: 1000,
        companyAmount: 600,
        pocketAmount: 400,
        departmentCount: 2,
        categoryCount: 3,
        recentExpenses: [
          {
            _id: "exp1",
            title: "Figma seat",
            amount: 12,
            amountInBaseCurrency: 1000,
            currency: { code: "USD", symbol: "$", isBase: false },
            date: "2026-11-10T00:00:00.000Z",
            category: { name: "Software" },
            department: { name: "Engineering" },
          },
        ],
      },
      {
        monthlyTrend,
        topCategories: [{ _id: "cat1", name: "Software", total: 800, count: 4 }],
        departmentSpend: [{ _id: "dep1", name: "Engineering", total: 700, count: 4 }],
      },
      [
        person("u1", "Asha", 100),
        person("u2", "Ravi", 250),
        person("u3", "Nobody", 0),
        person("u4", "Meera", 50),
      ]
    );

    render(<DashboardPage />);

    expect(await screen.findByRole("heading", { level: 1, name: "Overview" })).toBeInTheDocument();
    expect(screen.getByText("Company spend across every department, all time, in INR.")).toBeInTheDocument();

    // Totals band
    const totals = screen.getByRole("region", { name: "Totals" });
    expect(within(totals).getByText(formatBaseCurrency(1000))).toBeInTheDocument();
    expect(within(totals).getByText("5 expenses · 2 departments · 3 categories")).toBeInTheDocument();
    expect(within(totals).getByText("November to date")).toBeInTheDocument();
    expect(within(totals).getByText("1 expense · 13 of 30 days")).toBeInTheDocument();
    expect(within(totals).getByText("40.0% of spend")).toBeInTheDocument();
    expect(within(totals).getByText(formatBaseCurrency(200))).toBeInTheDocument(); // average

    // Monthly bars open that month's expenses
    const months = screen.getByRole("list", { name: "Monthly spend" });
    expect(within(months).getAllByRole("link")).toHaveLength(6);
    expect(within(months).getByRole("link", { name: /^October 2026: / })).toHaveAttribute(
      "href",
      "/dashboard/expenses?month=2026-10"
    );
    expect(within(months).getByRole("link", { name: /^November 2026 to date: / })).toBeInTheDocument();
    expect(screen.getByText(/November is hatched: month to date\./)).toBeInTheDocument();

    // Categories: top rows link to the filtered list, the remainder is grouped
    const categories = screen.getByRole("region", { name: "Categories" });
    expect(within(categories).getByRole("link", { name: /Software/ })).toHaveAttribute(
      "href",
      "/dashboard/expenses?category=cat1"
    );
    expect(within(categories).getByText("Other categories")).toBeInTheDocument();
    expect(within(categories).getByText(formatBaseCurrency(200))).toBeInTheDocument();

    // Departments: likewise, so the shares add up to 100%
    const departments = screen.getByRole("region", { name: "Departments" });
    expect(within(departments).getByRole("link", { name: /Engineering/ })).toHaveAttribute(
      "href",
      "/dashboard/expenses?department=dep1"
    );
    expect(within(departments).getByText("Other departments")).toBeInTheDocument();
    expect(within(departments).getByText("30.0%")).toBeInTheDocument();
    expect(within(departments).getByText(formatBaseCurrency(300))).toBeInTheDocument();

    // Who paid: the split, then pocket spend per person (most owed first, each opening their expenses)
    const whoPaid = screen.getByRole("region", { name: "Who paid" });
    expect(within(whoPaid).getByRole("img", { name: "Company paid 60.0%, pocket 40.0%" })).toBeInTheDocument();
    const byPerson = await within(whoPaid).findByRole("region", { name: "Pocket spend by person" });
    const people = within(byPerson).getAllByRole("link");
    expect(people.map((link) => link.textContent)).toEqual([
      expect.stringContaining("Ravi"),
      expect.stringContaining("Asha"),
      expect.stringContaining("Meera"),
    ]);
    expect(people[0]).toHaveAttribute("href", "/dashboard/expenses?paidBy=u2");
    expect(within(people[0]).getByText("62.5%")).toBeInTheDocument(); // 250 of 400 pocket
    // Everyone's pocket spend is listed, so there is no remainder row.
    expect(within(byPerson).queryByText("Other people")).not.toBeInTheDocument();

    // Latest entries: original amount first, base equivalent below
    const latest = screen.getByRole("region", { name: "Your latest entries" });
    const row = within(latest).getByRole("link", { name: /Figma seat/ });
    expect(row).toHaveAttribute("href", "/dashboard/expenses?expand=exp1");
    expect(within(row).getByText(formatBaseCurrency(1000))).toBeInTheDocument();
    expect(within(row).getByText("10 Nov 2026")).toBeInTheDocument();
  });

  it("groups pocket spend beyond the top five people into one row", async () => {
    mockApi(
      { totalExpenses: 6, totalAmount: 700, companyAmount: 0, pocketAmount: 700, departmentCount: 1, categoryCount: 1, recentExpenses: [] },
      { monthlyTrend, topCategories: [], departmentSpend: [] },
      [
        person("u1", "Asha", 200),
        person("u2", "Ravi", 150),
        person("u3", "Meera", 120),
        person("u4", "Kiran", 100),
        person("u5", "Dev", 80),
        person("u6", "Tara", 50),
      ]
    );

    render(<DashboardPage />);

    const byPerson = await screen.findByRole("region", { name: "Pocket spend by person" });
    const rows = within(byPerson).getAllByRole("listitem");
    expect(rows).toHaveLength(6);
    expect(within(byPerson).getAllByRole("link")).toHaveLength(5);
    expect(within(byPerson).queryByText("Tara")).not.toBeInTheDocument();
    // Tara's 50 is the rest of the 700 pocket, so the shares add up to 100%.
    const other = rows[5];
    expect(other).toHaveTextContent("Other people");
    expect(within(other).getByText(formatBaseCurrency(50))).toBeInTheDocument();
    expect(within(other).getByText("7.1%")).toBeInTheDocument();
  });

  it("shows the empty state of Who paid to admins when nothing has been paid", async () => {
    mockApi(
      { totalExpenses: 0, totalAmount: 0, companyAmount: 0, pocketAmount: 0, departmentCount: 0, categoryCount: 0, recentExpenses: [] },
      { monthlyTrend: [], topCategories: [], departmentSpend: [] }
    );

    render(<DashboardPage />);

    const whoPaid = await screen.findByRole("region", { name: "Who paid" });
    expect(within(whoPaid).getByText("No payment data")).toBeInTheDocument();
    expect(within(whoPaid).queryByRole("img", { name: /company paid/i })).not.toBeInTheDocument();
  });

  it("counts the month's days from the server's month, not the viewer's", async () => {
    // 1 Dec in India, still 30 Nov in UTC: the last bucket is November.
    const tz = process.env.TZ;
    process.env.TZ = "Asia/Kolkata";
    vi.setSystemTime(new Date("2026-11-30T20:00:00Z"));
    try {
      mockApi(
        { totalExpenses: 1, totalAmount: 300, departmentCount: 1, categoryCount: 1, recentExpenses: [] },
        { monthlyTrend, topCategories: [], departmentSpend: [] }
      );

      render(<DashboardPage />);

      const totals = await screen.findByRole("region", { name: "Totals" });
      expect(within(totals).getByText("November to date")).toBeInTheDocument();
      expect(within(totals).getByText("1 expense · 30 of 30 days")).toBeInTheDocument();
    } finally {
      process.env.TZ = tz;
    }
  });

  it("dates the latest entries by their calendar day, west of UTC too", async () => {
    const tz = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    try {
      mockApi(
        {
          totalExpenses: 1,
          totalAmount: 50,
          departmentCount: 1,
          categoryCount: 1,
          recentExpenses: [
            {
              _id: "exp1",
              title: "Lunch",
              amount: 50,
              amountInBaseCurrency: 50,
              currency: { code: "INR", symbol: "₹", isBase: true },
              date: "2026-11-10T00:00:00.000Z",
            },
          ],
        },
        { monthlyTrend, topCategories: [], departmentSpend: [] }
      );

      render(<DashboardPage />);

      const row = await screen.findByRole("link", { name: /Lunch/ });
      expect(within(row).getByText("10 Nov 2026")).toBeInTheDocument();
      // A base-currency amount has no INR line under it.
      expect(within(row).getAllByText(/₹/)).toHaveLength(1);
    } finally {
      process.env.TZ = tz;
    }
  });

  it("shows empty states when there is no data", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { name: "Test User" }, isAdmin: false } as any);
    mockApi(
      { totalExpenses: 0, totalAmount: 0, departmentCount: 0, categoryCount: 0, recentExpenses: [] },
      { monthlyTrend: [], topCategories: [], departmentSpend: [] }
    );

    render(<DashboardPage />);

    expect(await screen.findByText("Your spend across all time, in INR.")).toBeInTheDocument();
    expect(screen.getByText("No trend data yet")).toBeInTheDocument();
    expect(screen.getByText("No category data")).toBeInTheDocument();
    expect(screen.getByText("No department data")).toBeInTheDocument();
    // A user's own company/pocket split is in the band; the panel (and /api/users) is for admins.
    expect(screen.queryByRole("region", { name: "Who paid" })).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalledWith("/api/users");
    expect(screen.getByText("No expenses yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add expense" })).toHaveAttribute("href", "/dashboard/expenses/new");
  });

  it("still renders when the API fails", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("network"));

    render(<DashboardPage />);

    expect(await screen.findByRole("heading", { level: 1, name: "Overview" })).toBeInTheDocument();
    expect(screen.getByText("No expenses yet")).toBeInTheDocument();
  });
});
