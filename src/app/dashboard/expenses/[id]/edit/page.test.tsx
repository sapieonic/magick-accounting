import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EditExpensePage from "./page";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";

const toastMock = vi.fn();
// Stable reference: the page reloads the expense whenever the router changes.
const router = { push: vi.fn() };

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useParams: () => ({ id: "expense-1" }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
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
    put: vi.fn(),
    delete: vi.fn(),
    postFormData: vi.fn(),
  },
}));

const splitExpense = {
  _id: "expense-1",
  title: "Client dinner",
  amount: 1000,
  amountInBaseCurrency: 1000,
  gstAmount: null,
  currency: { _id: "currency-1", code: "INR", symbol: "₹" },
  category: { _id: "category-1", name: "Meals & Entertainment" },
  department: { _id: "department-1", name: "Engineering" },
  date: "2026-07-02T00:00:00.000Z",
  description: "",
  paymentSource: "split",
  pocketAmount: 400,
  pocketAmountInBaseCurrency: 400,
};

function mockExpense(expense: Record<string, unknown>) {
  vi.mocked(api.get).mockImplementation((url: string) => {
    if (url.startsWith("/api/expenses/")) {
      return Promise.resolve({ expense, assets: [] });
    }
    if (url.startsWith("/api/lookups")) {
      return Promise.resolve({
        departments: [{ _id: "department-1", name: "Engineering" }],
        categories: [{ _id: "category-1", name: "Meals & Entertainment" }],
        currencies: [{ _id: "currency-1", code: "INR", name: "Indian Rupee", symbol: "₹", isBase: true }],
      });
    }
    return Promise.resolve({});
  });
}

function submit() {
  fireEvent.submit(screen.getByRole("button", { name: "Update Expense" }).closest("form")!);
}

describe("EditExpensePage split payment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ isAdmin: true } as any);
    vi.mocked(api.put).mockResolvedValue({});
  });

  it("prefills the pocket share and shows the company share", async () => {
    mockExpense(splitExpense);
    render(<EditExpensePage />);

    expect(await screen.findByLabelText(/payment source/i)).toHaveValue("split");
    expect(screen.getByLabelText(/paid from pocket \(₹\)/i)).toHaveValue(400);
    expect(screen.getByLabelText(/paid by company \(₹\)/i)).toHaveValue("600.00");
  });

  it("flags the split instead of adjusting it when the amount drops below the pocket share", async () => {
    const user = userEvent.setup();
    mockExpense(splitExpense);
    render(<EditExpensePage />);

    const amount = await screen.findByLabelText(/^amount/i);
    await user.clear(amount);
    await user.type(amount, "300");

    expect(screen.getByLabelText(/paid from pocket/i)).toHaveValue(400);
    expect(screen.getByText(/pocket amount must be more than 0 and less than the total amount/i)).toBeInTheDocument();

    submit();
    expect(api.put).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith(
      "Pocket amount must be more than 0 and less than the total amount",
      "error"
    );
  });

  it("blocks submit with an inline error when switching to split without a pocket share", async () => {
    const user = userEvent.setup();
    mockExpense({ ...splitExpense, paymentSource: "pocket", pocketAmount: 1000, pocketAmountInBaseCurrency: 1000 });
    render(<EditExpensePage />);

    await user.selectOptions(await screen.findByLabelText(/payment source/i), "split");
    expect(screen.getByLabelText(/paid from pocket/i)).toHaveValue(null);
    expect(screen.queryByText(/enter the amount paid from pocket/i)).not.toBeInTheDocument();

    submit();
    expect(api.put).not.toHaveBeenCalled();
    expect(screen.getByText(/enter the amount paid from pocket/i)).toBeInTheDocument();
  });

  it("sends the pocket share for split and null otherwise", async () => {
    const user = userEvent.setup();
    mockExpense(splitExpense);
    render(<EditExpensePage />);

    const pocket = await screen.findByLabelText(/paid from pocket/i);
    await user.clear(pocket);
    await user.type(pocket, "250");
    submit();

    await vi.waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(api.put).toHaveBeenCalledWith(
      "/api/expenses/expense-1",
      expect.objectContaining({ paymentSource: "split", amount: 1000, pocketAmount: 250 })
    );

    vi.mocked(api.put).mockClear();
    await user.selectOptions(screen.getByLabelText(/payment source/i), "company");
    submit();

    await vi.waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(api.put).toHaveBeenCalledWith(
      "/api/expenses/expense-1",
      expect.objectContaining({ paymentSource: "company", pocketAmount: null })
    );
  });
});
