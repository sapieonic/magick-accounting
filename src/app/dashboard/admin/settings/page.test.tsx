import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminSettingsPage from "./page";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("@/hooks/useTitle", () => ({ useTitle: vi.fn() }));
const toast = vi.fn();
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast }) }));

const responses: Record<string, unknown> = {
  "/api/domains": { domains: [{ _id: "dom1", domain: "example.com", addedBy: { name: "Ada" }, createdAt: "" }] },
  "/api/currencies": {
    currencies: [
      { _id: "inr", code: "INR", name: "Indian Rupee", symbol: "₹", rateToBase: 1, isBase: true, isActive: true },
      { _id: "usd", code: "USD", name: "US Dollar", symbol: "$", rateToBase: 83.5, isBase: false, isActive: true },
    ],
  },
  "/api/invoice-settings": { settings: { sellerName: "Magick", cgstRate: 9, sgstRate: 9 } },
  "/api/telegram/settings": { telegram: { configured: false, appUrl: "", linkedUsers: 0 } },
};

describe("AdminSettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ isAdmin: true } as never);
    vi.mocked(api.get).mockImplementation(async (url: string) => responses[url]);
  });

  it("redirects non-admins", () => {
    vi.mocked(useAuth).mockReturnValue({ isAdmin: false } as never);
    render(<AdminSettingsPage />);
    expect(replace).toHaveBeenCalledWith("/dashboard");
  });

  it("renders every section with a section nav", async () => {
    render(<AdminSettingsPage />);
    const nav = await screen.findByRole("navigation", { name: "Settings sections" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["#access", "#currencies", "#telegram", "#invoices"]);
    expect(links[0]).toHaveAttribute("aria-current", "location");

    expect(screen.getByRole("region", { name: "Allowed email domains" })).toHaveAttribute("id", "access");
    expect(screen.getByRole("region", { name: "Currencies & exchange rates" })).toHaveAttribute("id", "currencies");
    expect(screen.getByRole("region", { name: "Telegram bot" })).toHaveAttribute("id", "telegram");
    expect(screen.getByRole("region", { name: "Invoice defaults" })).toHaveAttribute("id", "invoices");

    // The last allowed domain cannot be removed.
    expect(screen.getByRole("button", { name: "Remove @example.com" })).toBeDisabled();
    expect(screen.getByText("1 USD = 83.50 INR")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit rate for INR" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Seller name")).toHaveValue("Magick");
  });

  it("updates an exchange rate and reloads", async () => {
    vi.mocked(api.put).mockResolvedValue({});
    render(<AdminSettingsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Edit rate for USD" }));
    const rate = screen.getByLabelText("1 USD = ? INR");
    await userEvent.clear(rate);
    await userEvent.type(rate, "84.25");
    await userEvent.click(screen.getByRole("button", { name: "Update Rate" }));

    expect(api.put).toHaveBeenCalledWith("/api/currencies/usd", { rateToBase: 84.25 });
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Exchange rate updated"));
    await waitFor(() => expect(vi.mocked(api.get).mock.calls.filter(([u]) => u === "/api/domains")).toHaveLength(2));
  });

  it("saves invoice defaults", async () => {
    vi.mocked(api.put).mockResolvedValue({ settings: { sellerName: "Magick LLP", cgstRate: 6, sgstRate: 6 } });
    render(<AdminSettingsPage />);
    const seller = await screen.findByLabelText("Seller name");
    await userEvent.clear(seller);
    await userEvent.type(seller, "Magick LLP");
    await userEvent.click(screen.getByRole("button", { name: "Save invoice defaults" }));

    expect(api.put).toHaveBeenCalledWith(
      "/api/invoice-settings",
      expect.objectContaining({ sellerName: "Magick LLP", cgstRate: "9", sgstRate: "9" })
    );
    expect(await screen.findByLabelText("CGST %")).toHaveValue(6);
    expect(toast).toHaveBeenCalledWith("Invoice defaults saved");
  });
});
