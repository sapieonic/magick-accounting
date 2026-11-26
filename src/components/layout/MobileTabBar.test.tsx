import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { usePathname } from "next/navigation";
import { useApprovalCount } from "@/contexts/ApprovalCountContext";
import MobileTabBar from "./MobileTabBar";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

vi.mock("@/contexts/ApprovalCountContext", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/contexts/ApprovalCountContext")>()),
  useApprovalCount: vi.fn(() => ({ count: 0, pendingAmount: 0, oldestPendingAt: null, refresh: () => {} })),
}));

const more = () => screen.getByRole("button", { name: "More" });

describe("MobileTabBar", () => {
  beforeEach(() => {
    vi.mocked(usePathname).mockReturnValue("/dashboard");
  });

  it.each([
    "/dashboard/assets",
    "/dashboard/departments",
    "/dashboard/categories",
    "/dashboard/invoices",
    "/dashboard/admin/users",
    "/dashboard/admin/settings",
    "/dashboard/profile",
  ])("marks More active on %s, a page reached through the drawer", (path) => {
    vi.mocked(usePathname).mockReturnValue(path);
    render(<MobileTabBar onMore={() => {}} moreOpen={false} />);
    expect(more()).toHaveClass("text-accent");
    expect(screen.queryByRole("link", { current: "page" })).not.toBeInTheDocument();
  });

  it.each([
    ["/dashboard", "Overview"],
    ["/dashboard/expenses", "Expenses"],
    ["/dashboard/trips/abc", "Trips"],
  ])("leaves More idle on %s", (path, tab) => {
    vi.mocked(usePathname).mockReturnValue(path);
    render(<MobileTabBar onMore={() => {}} moreOpen={false} />);
    expect(more()).not.toHaveClass("text-accent");
    expect(screen.getByRole("link", { name: tab })).toHaveAttribute("aria-current", "page");
  });

  it("leaves More idle on New expense, which the Add button represents", () => {
    vi.mocked(usePathname).mockReturnValue("/dashboard/expenses/new");
    render(<MobileTabBar onMore={() => {}} moreOpen={false} />);
    expect(more()).not.toHaveClass("text-accent");
    expect(screen.getByRole("link", { name: "New expense" })).toHaveAttribute("aria-current", "page");
  });

  it("dots More while approvals are waiting, and says so in its name", () => {
    vi.mocked(useApprovalCount).mockReturnValue({ count: 3, pendingAmount: 0, oldestPendingAt: null, refresh: () => {} });
    render(<MobileTabBar onMore={() => {}} moreOpen={false} />);
    const button = screen.getByRole("button", { name: "More, 3 awaiting approval" });
    expect(screen.getByTestId("more-count-dot")).toHaveAttribute("aria-hidden", "true");
    expect(button).toContainElement(screen.getByTestId("more-count-dot"));
  });

  it("marks More active on the approvals queue, a page reached through the drawer", () => {
    vi.mocked(useApprovalCount).mockReturnValue({ count: 0, pendingAmount: 0, oldestPendingAt: null, refresh: () => {} });
    vi.mocked(usePathname).mockReturnValue("/dashboard/approvals");
    render(<MobileTabBar onMore={() => {}} moreOpen={false} />);
    expect(more()).toHaveClass("text-accent");
    expect(screen.queryByTestId("more-count-dot")).not.toBeInTheDocument();
  });
});
