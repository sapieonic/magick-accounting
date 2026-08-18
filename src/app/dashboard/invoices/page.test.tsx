import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import InvoicesPage from "./page";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({
    replace: vi.fn(),
  })),
}));

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    postBlob: vi.fn(),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/hooks/useTitle", () => ({
  useTitle: vi.fn(),
}));

vi.mock("@/components/ui/Toast", () => ({
  useToast: vi.fn(() => ({
    toast: vi.fn(),
  })),
}));

async function renderInvoiceForm() {
  vi.mocked(useRouter).mockReturnValue({ replace: vi.fn() } as any);
  vi.mocked(useAuth).mockReturnValue({
    isAdmin: true,
    user: { email: "admin@example.com" },
  } as any);
  vi.mocked(api.get).mockResolvedValue({
    settings: {
      sellerName: "Magick",
      sellerGstin: "",
      sellerAddress: "",
      hsnSac: "",
      cgstRate: 9,
      sgstRate: 9,
      bankAccountName: "",
      bankAccountNumber: "",
      bankAccountType: "",
      bankIfsc: "",
    },
  });

  render(<InvoicesPage />);
  await screen.findByRole("heading", { name: "Generate Tax Invoice" });
  await screen.findByDisplayValue("admin@example.com");
}

async function fillLineItem(user: ReturnType<typeof userEvent.setup>, rate = "1000") {
  await user.type(screen.getByPlaceholderText("Description"), "Consulting");
  await user.type(screen.getByPlaceholderText("Rate"), rate);
}

describe("InvoicesPage discounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn(() => "blob:invoice"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hides discount value fields until a discount type is chosen", async () => {
    await renderInvoiceForm();

    expect(screen.getByLabelText("Discount type")).toHaveValue("none");
    expect(screen.queryByLabelText("Discount value")).not.toBeInTheDocument();
    expect(screen.queryByText("Taxable Amount")).not.toBeInTheDocument();
  });

  it("applies a percentage discount to the live summary before GST", async () => {
    const user = userEvent.setup();
    await renderInvoiceForm();
    await fillLineItem(user, "1000");

    await user.selectOptions(screen.getByLabelText("Discount type"), "percentage");
    await user.type(screen.getByLabelText("Discount value"), "10");

    expect(screen.getByText("Discount (10%)")).toBeInTheDocument();
    expect(screen.getByText("-₹100.00")).toBeInTheDocument();
    expect(screen.getByText("Taxable Amount")).toBeInTheDocument();
    expect(screen.getByText("₹900.00")).toBeInTheDocument();
    expect(screen.getByText("₹1,062.00")).toBeInTheDocument();
  });

  it("applies a labelled fixed discount to the live summary", async () => {
    const user = userEvent.setup();
    await renderInvoiceForm();
    await fillLineItem(user, "250");

    await user.selectOptions(screen.getByLabelText("Discount type"), "fixed");
    await user.type(screen.getByLabelText("Discount value"), "50");
    await user.type(screen.getByPlaceholderText("e.g. Volume discount"), "Loyalty");

    expect(screen.getByText("Discount (Loyalty)")).toBeInTheDocument();
    expect(screen.getByText("-₹50.00")).toBeInTheDocument();
    expect(screen.getByText("₹200.00")).toBeInTheDocument();
    expect(screen.getByText("₹236.00")).toBeInTheDocument();
  });

  it("includes the discount in the generate-invoice payload", async () => {
    const user = userEvent.setup();
    vi.mocked(api.postBlob).mockResolvedValue(new Blob(["pdf"]));

    await renderInvoiceForm();
    await fillLineItem(user, "1000");
    await user.type(screen.getByPlaceholderText("e.g. Mr. Ashish Chauhan"), "Acme Ltd");
    await user.selectOptions(screen.getByLabelText("Discount type"), "percentage");
    await user.type(screen.getByLabelText("Discount value"), "10");
    await user.type(screen.getByPlaceholderText("e.g. Volume discount"), "Volume discount");

    await user.click(screen.getByRole("button", { name: "Generate Invoice" }));

    await waitFor(() => {
      expect(api.postBlob).toHaveBeenCalledWith(
        "/api/invoices/generate",
        expect.objectContaining({
          discount: { type: "percentage", value: 10, description: "Volume discount" },
        })
      );
    });
  });

  it("includes the discount in the generate-receipt payload", async () => {
    const user = userEvent.setup();
    vi.mocked(api.postBlob).mockResolvedValue(new Blob(["pdf"]));

    await renderInvoiceForm();
    await fillLineItem(user, "1000");
    await user.type(screen.getByPlaceholderText("e.g. Mr. Ashish Chauhan"), "Acme Ltd");
    await user.selectOptions(screen.getByLabelText("Discount type"), "percentage");
    await user.type(screen.getByLabelText("Discount value"), "10");

    await user.click(screen.getByRole("button", { name: "Generate Receipt" }));

    await waitFor(() => {
      expect(api.postBlob).toHaveBeenCalledWith(
        "/api/invoices/receipt",
        expect.objectContaining({
          discount: { type: "percentage", value: 10 },
          payment: expect.objectContaining({ amountReceived: 1062 }),
        })
      );
    });
  });
});
