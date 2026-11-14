import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { usePathname } from "next/navigation";
import MobileTabBar from "./MobileTabBar";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
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
});
