import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DepartmentsPage from "@/app/dashboard/departments/page";
import CategoriesPage from "@/app/dashboard/categories/page";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("@/hooks/useTitle", () => ({ useTitle: vi.fn() }));
const toast = vi.fn();
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast }) }));

const departments = [
  { _id: "d1", name: "General", description: "", isDefault: true, createdAt: "" },
  { _id: "d2", name: "Engineering", description: "Builds things", isDefault: false, createdAt: "" },
];

describe("Departments / Categories (OrgListPage)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists departments linking to their expenses; admins manage custom ones only", async () => {
    vi.mocked(useAuth).mockReturnValue({ isAdmin: true } as never);
    vi.mocked(api.get).mockResolvedValue({ departments });
    render(<DepartmentsPage />);

    expect(await screen.findByRole("link", { name: "View expenses in Engineering" })).toHaveAttribute(
      "href",
      "/dashboard/expenses?department=d2"
    );
    expect(screen.getByText("Builds things")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Engineering" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete Engineering" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit General" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete General" })).not.toBeInTheDocument();
  });

  it("hides edit and delete from non-admins", async () => {
    vi.mocked(useAuth).mockReturnValue({ isAdmin: false } as never);
    vi.mocked(api.get).mockResolvedValue({ departments });
    render(<DepartmentsPage />);

    await screen.findByText("Engineering");
    expect(screen.queryByRole("button", { name: /^(Edit|Delete) / })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add department" })).toBeInTheDocument();
  });

  it("edits a department and deletes after confirmation", async () => {
    vi.mocked(useAuth).mockReturnValue({ isAdmin: true } as never);
    vi.mocked(api.get).mockResolvedValue({ departments });
    vi.mocked(api.put).mockResolvedValue({});
    vi.mocked(api.delete).mockResolvedValue({});
    render(<DepartmentsPage />);

    await userEvent.click(await screen.findByRole("button", { name: "Edit Engineering" }));
    const name = screen.getByLabelText("Name");
    expect(name).toHaveValue("Engineering");
    await userEvent.clear(name);
    await userEvent.type(name, "R&D");
    await userEvent.click(screen.getByRole("button", { name: "Update" }));
    expect(api.put).toHaveBeenCalledWith("/api/departments/d2", { name: "R&D", description: "Builds things" });
    expect(toast).toHaveBeenCalledWith("Department updated");

    await userEvent.click(screen.getByRole("button", { name: "Delete Engineering" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(api.delete).toHaveBeenCalledWith("/api/departments/d2");
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Department deleted"));
  });

  it("creates a category by trimmed name; categories have no edit", async () => {
    vi.mocked(useAuth).mockReturnValue({ isAdmin: true } as never);
    vi.mocked(api.get).mockResolvedValue({
      categories: [{ _id: "c1", name: "Travel", isDefault: false, createdAt: "" }],
    });
    vi.mocked(api.post).mockResolvedValue({});
    render(<CategoriesPage />);

    expect(await screen.findByRole("link", { name: "View expenses in Travel" })).toHaveAttribute(
      "href",
      "/dashboard/expenses?category=c1"
    );
    expect(screen.queryByRole("button", { name: "Edit Travel" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete Travel" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Add category" }));
    expect(screen.queryByLabelText(/Description/)).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Name"), "  Team Events ");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(api.post).toHaveBeenCalledWith("/api/categories", { name: "Team Events" });
    expect(toast).toHaveBeenCalledWith("Category created");
  });

  it("shows the empty state", async () => {
    vi.mocked(useAuth).mockReturnValue({ isAdmin: true } as never);
    vi.mocked(api.get).mockResolvedValue({ categories: [] });
    render(<CategoriesPage />);
    expect(await screen.findByText("No categories yet")).toBeInTheDocument();
  });
});
