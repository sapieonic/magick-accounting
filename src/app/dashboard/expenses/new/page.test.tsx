import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NewExpensePage from "./page";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";

const toastMock = vi.fn();
const router = { push: vi.fn() };

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

vi.mock("@/hooks/useTitle", () => ({
  useTitle: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    postFormData: vi.fn(),
  },
}));

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>, amount: string) {
  await user.type(await screen.findByLabelText(/^title/i), "Client dinner");
  await user.type(screen.getByLabelText(/^amount/i), amount);
  await user.selectOptions(screen.getByLabelText(/^category/i), "category-1");
}

function submit() {
  fireEvent.submit(screen.getByRole("button", { name: "Create Expense" }).closest("form")!);
}

describe("NewExpensePage split payment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem("expense-upload-modal-skip", "true");
    vi.mocked(useAuth).mockReturnValue({ user: null, isAdmin: false } as any);
    vi.mocked(api.post).mockResolvedValue({});
    vi.mocked(api.get).mockResolvedValue({
      departments: [{ _id: "department-1", name: "Engineering", isDefault: true }],
      categories: [{ _id: "category-1", name: "Meals & Entertainment" }],
      currencies: [{ _id: "currency-1", code: "INR", name: "Indian Rupee", symbol: "₹", isBase: true }],
    });
  });

  it("blocks submit when the pocket share is not less than the amount", async () => {
    const user = userEvent.setup();
    render(<NewExpensePage />);
    await fillRequiredFields(user, "500");

    await user.selectOptions(screen.getByLabelText(/payment source/i), "split");
    await user.type(screen.getByLabelText(/paid from pocket \(₹\)/i), "500");

    expect(screen.getByText(/pocket amount must be more than 0 and less than the total amount/i)).toBeInTheDocument();
    submit();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("posts the pocket share for a valid split", async () => {
    const user = userEvent.setup();
    render(<NewExpensePage />);
    await fillRequiredFields(user, "500");

    await user.selectOptions(screen.getByLabelText(/payment source/i), "split");
    await user.type(screen.getByLabelText(/paid from pocket/i), "120.25");
    expect(screen.getByLabelText(/paid by company \(₹\)/i)).toHaveValue("379.75");

    submit();
    await vi.waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.post).toHaveBeenCalledWith(
      "/api/expenses",
      expect.objectContaining({ amount: 500, paymentSource: "split", pocketAmount: 120.25 })
    );
  });

  it("holds back the split error until an amount is entered", async () => {
    const user = userEvent.setup();
    render(<NewExpensePage />);
    await user.selectOptions(await screen.findByLabelText(/payment source/i), "split");
    await user.type(screen.getByLabelText(/paid from pocket/i), "120");

    expect(screen.queryByText(/less than the total amount/i)).not.toBeInTheDocument();
  });

  it("keeps the split when AI auto-fill changes the amount, and flags it if it no longer fits", async () => {
    const user = userEvent.setup();
    vi.mocked(api.postFormData).mockResolvedValue({ title: "Cab", amount: 100 });
    render(<NewExpensePage />);
    await fillRequiredFields(user, "500");
    await user.selectOptions(screen.getByLabelText(/payment source/i), "split");
    await user.type(screen.getByLabelText(/paid from pocket/i), "120");

    const fileInput = screen
      .getByTestId("receipt-dropzone")
      .querySelector("input[type=file]") as HTMLInputElement;
    await user.upload(fileInput, new File(["receipt"], "cab.png", { type: "image/png" }));

    await vi.waitFor(() => expect(screen.getByLabelText(/^amount/i)).toHaveValue(100));
    expect(screen.getByLabelText(/payment source/i)).toHaveValue("split");
    expect(screen.getByLabelText(/paid from pocket/i)).toHaveValue(120);
    expect(screen.getByText(/pocket amount must be more than 0 and less than the total amount/i)).toBeInTheDocument();
  });

  it("sends a null pocket share for a non-split payment", async () => {
    const user = userEvent.setup();
    render(<NewExpensePage />);
    await fillRequiredFields(user, "500");

    submit();
    await vi.waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.post).toHaveBeenCalledWith(
      "/api/expenses",
      expect.objectContaining({ paymentSource: "pocket", pocketAmount: null })
    );
  });
});
