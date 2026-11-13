import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
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
    vi.unstubAllGlobals();
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

  it("moves focus into the drawer, traps Tab and returns focus to More on close", async () => {
    const user = userEvent.setup();
    function Harness({ open }: { open: boolean }) {
      return (
        <>
          <button>More</button>
          <Sidebar open={open} onClose={() => {}} />
        </>
      );
    }
    const { rerender } = render(<Harness open={false} />);
    const more = screen.getByRole("button", { name: "More" });
    more.focus();

    rerender(<Harness open />);
    const drawer = screen.getByRole("dialog", { name: "Navigation" });
    expect(drawer).toContainElement(document.activeElement as HTMLElement);

    const close = screen.getByRole("button", { name: "Close navigation" });
    const signOut = within(drawer).getByRole("button", { name: "Sign out" });
    signOut.focus();
    await user.tab();
    expect(drawer).toContainElement(document.activeElement as HTMLElement);
    expect(more).not.toHaveFocus();
    await user.tab({ shift: true });
    expect(signOut).toHaveFocus();
    expect(close).toBeInTheDocument();

    rerender(<Harness open={false} />);
    expect(more).toHaveFocus();
  });

  it("closes the drawer on Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Sidebar open onClose={onClose} />);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes the drawer when the route changes by other means (⌘K, back)", () => {
    const onClose = vi.fn();
    const { rerender } = render(<Sidebar open onClose={onClose} />);
    expect(onClose).not.toHaveBeenCalled();

    vi.mocked(usePathname).mockReturnValue("/dashboard/trips");
    rerender(<Sidebar open onClose={onClose} />);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("starts collapsed without animating from the wide rail", () => {
    localStorage.setItem("sidebar-collapsed", "true");
    // The very first render (no effects run) already has the collapsed width,
    // so the rail never transitions 232 -> 72px on load.
    const html = renderToStaticMarkup(<Sidebar open={false} onClose={() => {}} />);
    expect(html).toMatch(/\bw-\[72px\]/);
    expect(html).not.toMatch(/\bw-\[232px\]/);
  });

  it("uses the overlay token for the drawer backdrop", () => {
    render(<Sidebar open onClose={() => {}} />);
    const backdrop = screen.getByRole("dialog", { name: "Navigation" }).firstElementChild;
    expect(backdrop?.className).toMatch(/\bbg-overlay\/45\b/);
  });

  it("closes the drawer once the lg rail takes over", () => {
    const listeners = new Set<() => void>();
    let wide = false;
    vi.stubGlobal(
      "matchMedia",
      (query: string) =>
        ({
          get matches() {
            return query === "(min-width: 1024px)" && wide;
          },
          media: query,
          addEventListener: (_: string, fn: () => void) => listeners.add(fn),
          removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
        }) as unknown as MediaQueryList
    );
    const onClose = vi.fn();
    render(<Sidebar open onClose={onClose} />);
    expect(onClose).not.toHaveBeenCalled();

    wide = true;
    act(() => listeners.forEach((fn) => fn()));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows the role and Profile in full on the rail instead of truncating them", () => {
    vi.mocked(useAuth).mockReturnValue({
      isAdmin: true,
      user: { name: "Ada Lovelace", role: "master_admin" },
      logout: vi.fn(),
    } as any);
    const { container } = render(<Sidebar open={false} onClose={() => {}} />);
    const rail = container.querySelector("aside")!;
    const role = within(rail).getByText("Master admin");
    const line = role.parentElement!;
    expect(line).toHaveTextContent("Master admin · Profile");
    expect(line).not.toHaveClass("ell");
    expect(role).toHaveClass("whitespace-nowrap");
  });

  it("outlines the active link with the rail-mark token, not a raw colour", () => {
    render(<Sidebar open={false} onClose={() => {}} />);
    const active = screen.getAllByRole("link", { name: "Overview" })[0];
    expect(active).toHaveAttribute("aria-current", "page");
    expect(active.className).toMatch(/\bring-rail-mark\/\[\.22\]/);
    expect(active.className).not.toMatch(/rgba\(/);
  });
});
