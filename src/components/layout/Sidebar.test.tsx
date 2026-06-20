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
    vi.mocked(usePathname).mockReturnValue("/dashboard");
    vi.mocked(useAuth).mockReturnValue({ isAdmin: true, isMasterAdmin: true } as any);
  });

  it("should render the app version from package.json", () => {
    render(<Sidebar open={false} onClose={() => {}} />);
    
    // The version is rendered in the footer when the sidebar is NOT collapsed (iconOnly is false)
    expect(screen.getByText(`v${pkg.version}`)).toBeInTheDocument();
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
