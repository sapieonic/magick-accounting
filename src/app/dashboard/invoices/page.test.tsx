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
  await screen.findByRole("heading", { name: "Generate tax invoice" });
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
    expect(screen.queryByText("Taxable amount")).not.toBeInTheDocument();
  });

  it("applies a percentage discount to the live summary before GST", async () => {
    const user = userEvent.setup();
    await renderInvoiceForm();
    await fillLineItem(user, "1000");

    await user.selectOptions(screen.getByLabelText("Discount type"), "percentage");
    await user.type(screen.getByLabelText("Discount value"), "10");

    expect(screen.getByText("Discount (10%)")).toBeInTheDocument();
    expect(screen.getByText("-₹100.00")).toBeInTheDocument();
    expect(screen.getByText("Taxable amount")).toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: "Generate invoice" }));

    await waitFor(() => {
      expect(api.postBlob).toHaveBeenCalledWith(
        "/api/invoices/generate",
        expect.objectContaining({
          discount: { type: "percentage", value: 10, description: "Volume discount" },
        })
      );
    });
  });

  it("keeps the PDF's object URL alive until the download has started", async () => {
    const user = userEvent.setup();
    vi.mocked(api.postBlob).mockResolvedValue(new Blob(["pdf"]));
    const timers = vi.spyOn(globalThis, "setTimeout");

    await renderInvoiceForm();
    await fillLineItem(user, "1000");
    await user.type(screen.getByPlaceholderText("e.g. Mr. Ashish Chauhan"), "Acme Ltd");
    await user.click(screen.getByRole("button", { name: "Generate invoice" }));

    await waitFor(() => expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled());
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    const index = timers.mock.calls.findIndex(([, ms]) => ms === 40_000);
    expect(index).toBeGreaterThan(-1);
    clearTimeout(timers.mock.results[index].value);
    (timers.mock.calls[index][0] as () => void)();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:invoice");
  });

  it("includes the discount in the generate-receipt payload", async () => {
    const user = userEvent.setup();
    vi.mocked(api.postBlob).mockResolvedValue(new Blob(["pdf"]));

    await renderInvoiceForm();
    await fillLineItem(user, "1000");
    await user.type(screen.getByPlaceholderText("e.g. Mr. Ashish Chauhan"), "Acme Ltd");
    await user.selectOptions(screen.getByLabelText("Discount type"), "percentage");
    await user.type(screen.getByLabelText("Discount value"), "10");

    await user.click(screen.getByRole("button", { name: "Generate receipt" }));

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

describe("InvoicesPage builder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds and removes line items, keeping at least one", async () => {
    const user = userEvent.setup();
    await renderInvoiceForm();

    expect(screen.getByRole("button", { name: "Remove item 1" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Add item" }));
    expect(screen.getByLabelText("Item 2 description")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove item 2" }));
    expect(screen.queryByLabelText("Item 2 description")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove item 1" })).toBeDisabled();
  });

  it("keeps each line item's inputs when an earlier row is removed", async () => {
    const user = userEvent.setup();
    await renderInvoiceForm();

    await user.click(screen.getByRole("button", { name: "Add item" }));
    await user.click(screen.getByRole("button", { name: "Add item" }));
    await user.type(screen.getByLabelText("Item 2 description"), "Second");
    await user.type(screen.getByLabelText("Item 3 description"), "Third");
    const third = screen.getByLabelText("Item 3 description");

    await user.click(screen.getByRole("button", { name: "Remove item 2" }));

    // The same input element moves up (stable keys), so focus and state stay with it.
    expect(third).toBeInTheDocument();
    expect(third).toHaveValue("Third");
    expect(third).toHaveAccessibleName("Item 2 description");
  });

  it("previews the customer and counted items in the summary", async () => {
    const user = userEvent.setup();
    await renderInvoiceForm();

    expect(screen.getByText("No customer yet")).toBeInTheDocument();
    expect(screen.getByText("0 items")).toBeInTheDocument();

    await fillLineItem(user, "1000");
    await user.type(screen.getByPlaceholderText("e.g. Mr. Ashish Chauhan"), "Acme Ltd");

    expect(screen.getByText("Acme Ltd")).toBeInTheDocument();
    expect(screen.getByText("1 item")).toBeInTheDocument();
    expect(screen.getByText("Indian Rupee One Thousand One Hundred Eighty Only")).toBeInTheDocument();
  });
});
