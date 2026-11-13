import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminUsersPage from "./page";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({
    replace: vi.fn(),
  })),
}));

// Mock API
vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}));

// Mock AuthContext
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

// Mock useTitle
vi.mock("@/hooks/useTitle", () => ({
  useTitle: vi.fn(),
}));

// Mock Toast (a stable function, like the real hook's)
const toast = vi.fn();
vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ toast }),
}));

describe("AdminUsersPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should redirect non-admins to dashboard", async () => {
    const replaceMock = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ replace: replaceMock } as any);
    vi.mocked(useAuth).mockReturnValue({ isAdmin: false, isMasterAdmin: false } as any);

    render(<AdminUsersPage />);

    expect(replaceMock).toHaveBeenCalledWith("/dashboard");
  });

  const listNames = (region: HTMLElement, label: string) =>
    within(within(region).getByRole("list", { name: label }))
      .getAllByRole("listitem")
      .map((li) => li.textContent ?? "");

  it("should render users list and spend panels when admin", async () => {
    vi.mocked(useRouter).mockReturnValue({ replace: vi.fn() } as any);
    vi.mocked(useAuth).mockReturnValue({ isAdmin: true, isMasterAdmin: true } as any);

    vi.mocked(api.get).mockResolvedValueOnce({
      users: [
        { _id: "2", name: "Bob", email: "bob@test.com", role: "user", totalSpend: 300, companySpend: 0, pocketSpend: 300 },
        { _id: "1", name: "Alice", email: "alice@test.com", role: "admin", totalSpend: 500, companySpend: 300, pocketSpend: 200 },
        { _id: "3", name: "Charlie", email: "charlie@test.com", role: "user", totalSpend: 0, companySpend: 0, pocketSpend: 0 },
      ],
    });

    render(<AdminUsersPage />);

    const people = await screen.findByRole("list", { name: "Users" });
    expect(within(people).getAllByRole("listitem")).toHaveLength(3);
    expect(within(people).getByText("Alice")).toBeInTheDocument();
    expect(within(people).getByText("Charlie")).toBeInTheDocument();

    // Spend by user: only users with spend > 0, largest first.
    const spend = screen.getByRole("region", { name: "Spend by user" });
    const spendRows = listNames(spend, "Spend by user");
    expect(spendRows).toHaveLength(2);
    expect(spendRows[0]).toContain("Alice");
    expect(spendRows[0]).toContain("500");
    expect(spendRows[1]).toContain("Bob");
    expect(spendRows[1]).toContain("300");

    const source = screen.getByRole("region", { name: "Company vs pocket" });
    const sourceRows = listNames(source, "Company versus pocket spend by user");
    expect(sourceRows).toHaveLength(2);
    expect(sourceRows[0]).toContain("Alice");
    expect(sourceRows[1]).toContain("Bob");
    expect(within(source).getByRole("img", { name: "Company paid 60.0%, pocket 40.0%" })).toBeInTheDocument();
  });

  it("should hide the payment-source panel when breakdown fields are missing", async () => {
    vi.mocked(useRouter).mockReturnValue({ replace: vi.fn() } as any);
    vi.mocked(useAuth).mockReturnValue({ isAdmin: true, isMasterAdmin: true } as any);

    vi.mocked(api.get).mockResolvedValueOnce({
      users: [
        { _id: "1", name: "Alice", email: "alice@test.com", role: "admin", totalSpend: 500 },
      ],
    });

    render(<AdminUsersPage />);

    expect(await screen.findByRole("region", { name: "Spend by user" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Company vs pocket" })).not.toBeInTheDocument();
  });

  it("should hide both spend panels when users exist but none have spend", async () => {
    vi.mocked(useRouter).mockReturnValue({ replace: vi.fn() } as any);
    vi.mocked(useAuth).mockReturnValue({ isAdmin: true, isMasterAdmin: true } as any);

    vi.mocked(api.get).mockResolvedValueOnce({
      users: [
        { _id: "1", name: "Alice", email: "alice@test.com", role: "admin", totalSpend: 0, companySpend: 0, pocketSpend: 0 },
      ],
    });

    render(<AdminUsersPage />);

    expect(await screen.findByText("Alice")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Spend by user" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Company vs pocket" })).not.toBeInTheDocument();
  });

  it("filters people by search text and role", async () => {
    vi.mocked(useRouter).mockReturnValue({ replace: vi.fn() } as any);
    vi.mocked(useAuth).mockReturnValue({ isAdmin: true, isMasterAdmin: true } as any);
    vi.mocked(api.get).mockResolvedValueOnce({
      users: [
        { _id: "0", name: "Mira", email: "mira@test.com", role: "master_admin" },
        { _id: "1", name: "Alice", email: "alice@test.com", role: "admin" },
        { _id: "2", name: "Bob", email: "bob@other.com", role: "user" },
      ],
    });

    render(<AdminUsersPage />);
    const people = await screen.findByRole("list", { name: "Users" });
    expect(within(people).getAllByRole("listitem")).toHaveLength(3);

    await userEvent.click(screen.getByRole("button", { name: "Admins" }));
    let rows = within(screen.getByRole("list", { name: "Users" })).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual([expect.stringContaining("Mira"), expect.stringContaining("Alice")]);

    await userEvent.click(screen.getByRole("button", { name: "All" }));
    await userEvent.type(screen.getByLabelText("Search users"), "other.com");
    rows = within(screen.getByRole("list", { name: "Users" })).getAllByRole("listitem");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("Bob");

    await userEvent.click(screen.getByRole("button", { name: "Members" }));
    await userEvent.clear(screen.getByLabelText("Search users"));
    await userEvent.type(screen.getByLabelText("Search users"), "alice");
    expect(screen.getByText("No users match these filters.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(within(screen.getByRole("list", { name: "Users" })).getAllByRole("listitem")).toHaveLength(3);
  });

  it("lets the master admin toggle roles, but never the master admin's own", async () => {
    vi.mocked(useRouter).mockReturnValue({ replace: vi.fn() } as any);
    vi.mocked(useAuth).mockReturnValue({ isAdmin: true, isMasterAdmin: true } as any);
    const users = [
      { _id: "0", name: "Mira", email: "mira@test.com", role: "master_admin" },
      { _id: "2", name: "Bob", email: "bob@test.com", role: "user" },
    ];
    vi.mocked(api.get)
      .mockResolvedValueOnce({ users })
      .mockResolvedValueOnce({ users: [users[0], { ...users[1], role: "admin" }] });
    vi.mocked(api.patch).mockResolvedValueOnce({});

    render(<AdminUsersPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Make admin for Bob" }));
    expect(api.patch).toHaveBeenCalledWith("/api/users/2/role", { role: "admin" });
    expect(toast).toHaveBeenCalledWith("Bob is now an admin");
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("button", { name: "Remove admin for Bob" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /for Mira/ })).not.toBeInTheDocument();
  });

  it("shows no role controls to a plain admin", async () => {
    vi.mocked(useRouter).mockReturnValue({ replace: vi.fn() } as any);
    vi.mocked(useAuth).mockReturnValue({ isAdmin: true, isMasterAdmin: false } as any);
    vi.mocked(api.get).mockResolvedValueOnce({
      users: [{ _id: "2", name: "Bob", email: "bob@test.com", role: "user" }],
    });

    render(<AdminUsersPage />);
    expect(await screen.findByText("Only the master admin can change roles.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /admin for Bob/ })).not.toBeInTheDocument();
  });

  it("should display empty state when no users are returned", async () => {
    vi.mocked(useRouter).mockReturnValue({ replace: vi.fn() } as any);
    vi.mocked(useAuth).mockReturnValue({ isAdmin: true, isMasterAdmin: true } as any);
    vi.mocked(api.get).mockResolvedValueOnce({ users: [] });

    render(<AdminUsersPage />);

    expect(await screen.findByText("No users yet")).toBeInTheDocument();
    
    expect(screen.queryByRole("region", { name: "Spend by user" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Company vs pocket" })).not.toBeInTheDocument();
  });
});
