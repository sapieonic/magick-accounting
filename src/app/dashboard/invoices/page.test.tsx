import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
}

function fillLineItem(rate = "1000") {
  fireEvent.change(screen.getByPlaceholderText("Description"), {
    target: { value: "Consulting" },
  });
  fireEvent.change(screen.getByPlaceholderText("Rate"), {
    target: { value: rate },
  });
}

describe("InvoicesPage discounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hides discount value fields until a discount type is chosen", async () => {
    await renderInvoiceForm();

    expect(screen.getByLabelText("Discount type")).toHaveValue("none");
    expect(screen.queryByLabelText("Discount value")).not.toBeInTheDocument();
    expect(screen.queryByText("Taxable Amount")).not.toBeInTheDocument();
  });

  it("applies a percentage discount to the live summary before GST", async () => {
    await renderInvoiceForm();
    fillLineItem("1000");

    fireEvent.change(screen.getByLabelText("Discount type"), {
      target: { value: "percentage" },
    });
    fireEvent.change(screen.getByLabelText("Discount value"), {
      target: { value: "10" },
    });

    expect(screen.getByText("Discount (10%)")).toBeInTheDocument();
    expect(screen.getByText("-₹100.00")).toBeInTheDocument();
    expect(screen.getByText("Taxable Amount")).toBeInTheDocument();
    expect(screen.getByText("₹900.00")).toBeInTheDocument();
    expect(screen.getByText("₹1,062.00")).toBeInTheDocument();
  });

  it("applies a labelled fixed discount to the live summary", async () => {
    await renderInvoiceForm();
    fillLineItem("250");

    fireEvent.change(screen.getByLabelText("Discount type"), {
      target: { value: "fixed" },
    });
    fireEvent.change(screen.getByLabelText("Discount value"), {
      target: { value: "50" },
    });
    fireEvent.change(screen.getByPlaceholderText("e.g. Early payment"), {
      target: { value: "Loyalty" },
    });

    expect(screen.getByText("Discount (Loyalty)")).toBeInTheDocument();
    expect(screen.getByText("-₹50.00")).toBeInTheDocument();
    expect(screen.getByText("₹200.00")).toBeInTheDocument();
    expect(screen.getByText("₹236.00")).toBeInTheDocument();
  });

  it("includes the discount in the generate-invoice payload", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:invoice");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.mocked(api.postBlob).mockResolvedValue(new Blob(["pdf"]));

    await renderInvoiceForm();
    fillLineItem("1000");
    fireEvent.change(screen.getByPlaceholderText("e.g. Mr. Ashish Chauhan"), {
      target: { value: "Acme Ltd" },
    });
    fireEvent.change(screen.getByLabelText("Discount type"), {
      target: { value: "percentage" },
    });
    fireEvent.change(screen.getByLabelText("Discount value"), {
      target: { value: "10" },
    });
    fireEvent.change(screen.getByPlaceholderText("e.g. Early payment"), {
      target: { value: "Early payment" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Generate Invoice" }));

    await waitFor(() => {
      expect(api.postBlob).toHaveBeenCalledWith(
        "/api/invoices/generate",
        expect.objectContaining({
          discount: { type: "percentage", value: 10, description: "Early payment" },
        })
      );
    });
  });
});
