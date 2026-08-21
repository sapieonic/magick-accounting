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
    const rail = container.querySelector("aside")?.parentElement;

    expect(rail?.className).toMatch(/\bw-72\b/);
    expect(rail?.className).not.toMatch(/\bw-64\b/);
  });

  it("should render the app version from package.json", () => {
    render(<Sidebar open={false} onClose={() => {}} />);
    
    // The version is rendered in the footer when the sidebar is NOT collapsed (iconOnly is false)
    expect(screen.getByText(`v${pkg.version}`)).toBeInTheDocument();
  });

  it("keeps the collapse control above the main column", () => {
    const { container } = render(<Sidebar open={false} onClose={() => {}} />);
    const rail = container.querySelector("aside")?.parentElement;
    const collapse = screen.getByRole("button", { name: "Collapse sidebar", hidden: true });

    expect(rail?.className).toMatch(/\bz-40\b/);
    expect(collapse.className).toMatch(/-right-3/);
    expect(collapse.className).toMatch(/shadow-md/);
    expect(collapse.parentElement).toBe(rail);
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
