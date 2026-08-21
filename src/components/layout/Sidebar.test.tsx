import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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

  it("widens the expanded desktop rail so the lockup wordmark is not clipped", () => {
    const { container } = render(<Sidebar open={false} onClose={() => {}} />);
    const rail = container.querySelector("aside");

    expect(rail?.className).toMatch(/\bw-72\b/);
    expect(rail?.className).not.toMatch(/\bw-64\b/);
  });

  it("should render the app version from package.json", () => {
    render(<Sidebar open={false} onClose={() => {}} />);
    
    // The version is rendered in the footer when the sidebar is NOT collapsed (iconOnly is false)
    expect(screen.getByText(`v${pkg.version}`)).toBeInTheDocument();
  });

  it("keeps the collapse control fully inside the logo row", () => {
    render(<Sidebar open={false} onClose={() => {}} />);
    const collapse = screen.getByRole("button", { name: "Collapse sidebar", hidden: true });

    expect(collapse.className).toMatch(/\bml-auto\b/);
    expect(collapse.className).toMatch(/rounded-full/);
    expect(collapse.className).not.toMatch(/-right-/);
    expect(collapse.parentElement?.className).toMatch(/\bh-20\b/);
  });

  it("places the expand control below the mark when the rail is collapsed", async () => {
    localStorage.setItem("sidebar-collapsed", "true");
    render(<Sidebar open={false} onClose={() => {}} />);

    const expand = await screen.findByRole("button", { name: "Expand sidebar", hidden: true });
    expect(expand.className).not.toMatch(/\bml-auto\b/);
    expect(expand.parentElement?.className).toMatch(/flex-col/);
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
