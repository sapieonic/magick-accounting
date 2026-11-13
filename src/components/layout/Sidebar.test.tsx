import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Sidebar from "./Sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { usePathname } from "next/navigation";
import pkg from "../../../package.json";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

describe("Sidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(usePathname).mockReturnValue("/dashboard");
    vi.mocked(useAuth).mockReturnValue({ isAdmin: true, isMasterAdmin: true } as any);
  });

  it("renders the MagickVoice Accounting portal lockup", () => {
    render(<Sidebar open={false} onClose={() => {}} />);

    expect(screen.getAllByText("MagickVoice").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Accounting portal").length).toBeGreaterThan(0);
  });

  it("renders the 232px desktop rail", () => {
    const { container } = render(<Sidebar open={false} onClose={() => {}} />);
    const rail = container.querySelector("aside");

    expect(rail?.className).toMatch(/\bw-\[232px\]/);
  });

  it("should render the app version from package.json", () => {
    render(<Sidebar open={false} onClose={() => {}} />);
    
    // The version is rendered in the footer when the sidebar is NOT collapsed (iconOnly is false)
    expect(screen.getByText(`v${pkg.version}`)).toBeInTheDocument();
  });

  it("collapses the rail to icons and persists the choice", async () => {
    const user = userEvent.setup();
    const { container } = render(<Sidebar open={false} onClose={() => {}} />);

    await user.click(screen.getByRole("button", { name: "Collapse sidebar", hidden: true }));

    expect(localStorage.getItem("sidebar-collapsed")).toBe("true");
    expect(container.querySelector("aside")?.className).toMatch(/\bw-\[72px\]/);
    // Labels stay available to assistive tech while the rail shows icons only.
    expect(screen.getByRole("link", { name: "Expenses" })).toBeInTheDocument();
  });

  it("restores the collapsed rail and offers to expand it", async () => {
    localStorage.setItem("sidebar-collapsed", "true");
    render(<Sidebar open={false} onClose={() => {}} />);

    expect(await screen.findByRole("button", { name: "Expand sidebar", hidden: true })).toBeInTheDocument();
  });

  it("hides the admin group from non-admins", () => {
    vi.mocked(useAuth).mockReturnValue({ isAdmin: false, isMasterAdmin: false } as any);
    render(<Sidebar open={false} onClose={() => {}} />);

    expect(screen.queryByRole("link", { name: "Users" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Expenses" })).toBeInTheDocument();
  });

  it("signs out from the profile block", async () => {
    const logout = vi.fn();
    vi.mocked(useAuth).mockReturnValue({
      isAdmin: false,
      user: { name: "Ada Lovelace", role: "user" },
      logout,
    } as any);
    const user = userEvent.setup();
    render(<Sidebar open={false} onClose={() => {}} />);

    expect(screen.getByRole("link", { name: /Ada Lovelace/ })).toHaveAttribute("href", "/dashboard/profile");
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(logout).toHaveBeenCalled();
  });

  it("lists Trips right after Expenses", () => {
    render(<Sidebar open={false} onClose={() => {}} />);
    const labels = screen.getAllByRole("link").map((link) => link.textContent?.trim());

    expect(labels.indexOf("Trips")).toBe(labels.indexOf("Expenses") + 1);
    expect(screen.getByRole("link", { name: "Trips" })).toHaveAttribute("href", "/dashboard/trips");
  });

  it("highlights Trips on a trip's detail page", () => {
    vi.mocked(usePathname).mockReturnValue("/dashboard/trips/66c1884c0853f8a76a4da201");
    render(<Sidebar open={false} onClose={() => {}} />);

    expect(screen.getByRole("link", { name: "Trips" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Expenses" })).not.toHaveAttribute("aria-current");
  });

  it("should collapse sidebar on mobile when close button is clicked", () => {
    const onCloseMock = vi.fn();
    // Render in mobile overlay mode
    render(<Sidebar open={true} onClose={onCloseMock} />);
    
    const closeButton = screen.getByLabelText("Close navigation");
    closeButton.click();
    
    expect(onCloseMock).toHaveBeenCalled();
  });
});
