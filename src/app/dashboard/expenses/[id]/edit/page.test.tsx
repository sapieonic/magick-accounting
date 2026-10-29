import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

function mockExpense(expense: Record<string, unknown>, trips: unknown[] = []) {
  vi.mocked(api.get).mockImplementation((url: string) => {
    if (url.startsWith("/api/expenses/")) {
      return Promise.resolve({ expense, assets: [] });
    }
    if (url === "/api/trips") {
      return Promise.resolve({ trips });
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

  it("blocks submit when switching to split without a pocket share", async () => {
    const user = userEvent.setup();
    mockExpense({ ...splitExpense, paymentSource: "pocket", pocketAmount: 1000, pocketAmountInBaseCurrency: 1000 });
    render(<EditExpensePage />);

    await user.selectOptions(await screen.findByLabelText(/payment source/i), "split");
    expect(screen.getByLabelText(/paid from pocket/i)).toHaveValue(null);
    expect(screen.queryByText(/enter the amount paid from pocket/i)).not.toBeInTheDocument();

    // Browsers stop this via `required`; the handler still guards it (fireEvent
    // skips native validation).
    expect(screen.getByLabelText(/paid from pocket/i)).toBeRequired();
    submit();
    expect(api.put).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith(
      "Enter the amount paid from pocket for a split payment",
      "error"
    );
  });

  it("sends the pocket share for split and null otherwise", async () => {
    const user = userEvent.setup();
    mockExpense(splitExpense);
    render(<EditExpensePage />);

    const pocket = await screen.findByLabelText(/paid from pocket/i);
    await user.clear(pocket);
    await user.type(pocket, "250");
    submit();

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(api.put).toHaveBeenCalledWith(
      "/api/expenses/expense-1",
      expect.objectContaining({ paymentSource: "split", amount: 1000, pocketAmount: 250 })
    );

    vi.mocked(api.put).mockClear();
    await user.selectOptions(screen.getByLabelText(/payment source/i), "company");
    submit();

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(api.put).toHaveBeenCalledWith(
      "/api/expenses/expense-1",
      expect.objectContaining({ paymentSource: "company", pocketAmount: null })
    );
  });
});

describe("EditExpensePage paid by several people", () => {
  // The lookup mock returns no members, so both payers must come from the stored expense.
  const asha = { _id: "66c1884c0853f8a76a4da201", name: "Asha", email: "asha@example.com" };
  const ravi = { _id: "66c1884c0853f8a76a4da202", name: "Ravi", email: "ravi@example.com" };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ user: asha, isAdmin: true } as any);
    vi.mocked(api.put).mockResolvedValue({});
    mockExpense({
      ...splitExpense,
      paymentSource: "multiple",
      pocketAmount: 600,
      pocketAmountInBaseCurrency: 600,
      payments: [
        { paidBy: asha, amount: 600, amountInBaseCurrency: 600, source: "pocket" },
        { paidBy: ravi, amount: 400, amountInBaseCurrency: 400, source: "company" },
      ],
    });
  });

  it("prefills each stored payer and resends them on save", async () => {
    const user = userEvent.setup();
    render(<EditExpensePage />);

    expect(await screen.findByLabelText("Payer 1")).toHaveValue(asha._id);
    expect(screen.getByLabelText("Payer 2")).toHaveValue(ravi._id);
    expect(screen.getByLabelText(/amount for payment 2/i)).toHaveValue(400);
    expect(screen.getByText("Payments match the total")).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/^title/i));
    await user.type(screen.getByLabelText(/^title/i), "Team offsite");
    submit();

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(api.put).toHaveBeenCalledWith(
      "/api/expenses/expense-1",
      expect.objectContaining({
        title: "Team offsite",
        paymentSource: "multiple",
        payments: [
          { paidBy: asha._id, amount: 600, source: "pocket" },
          { paidBy: ravi._id, amount: 400, source: "company" },
        ],
      })
    );
  });
});

describe("EditExpensePage unsaved changes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ user: { _id: "66c1884c0853f8a76a4da201" }, isAdmin: true } as any);
    mockExpense({ ...splitExpense, paymentSource: "pocket", pocketAmount: 1000, pocketAmountInBaseCurrency: 1000 });
  });

  it("doesn't count trying several payers and switching back as a change", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<EditExpensePage />);

    const source = await screen.findByLabelText(/payment source/i);
    await user.selectOptions(source, "multiple");
    expect(screen.getByLabelText("Payer 1")).toBeInTheDocument();
    await user.selectOptions(source, "pocket");
    await user.click(screen.getByRole("button", { name: /back to expenses/i }));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith("/dashboard/expenses");
    confirmSpy.mockRestore();
  });
});

describe("EditExpensePage business trips", () => {
  const asha = { _id: "66c1884c0853f8a76a4da201", name: "Asha", email: "asha@example.com" };
  const visibleTrip = {
    _id: "66c1884c0853f8a76a4da301",
    name: "Pune offsite",
    destinations: ["Pune"],
    startDate: "2026-07-01T00:00:00.000Z",
    endDate: "2026-07-03T00:00:00.000Z",
    travelers: [asha],
    department: null,
    status: "completed",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ user: asha, isAdmin: true } as any);
    vi.mocked(api.put).mockResolvedValue({});
  });

  it("shows the stored trip and travel type, even when the trip isn't in the user's list", async () => {
    mockExpense(
      { ...splitExpense, trip: { _id: "66c1884c0853f8a76a4da399", name: "Mumbai client visit" }, travelType: "cab" },
      [visibleTrip]
    );
    render(<EditExpensePage />);

    const select = (await screen.findByLabelText(/business trip/i)) as HTMLSelectElement;
    expect(select).toHaveValue("66c1884c0853f8a76a4da399");
    expect(select.selectedOptions[0]).toHaveTextContent("Mumbai client visit");
    expect(screen.getByRole("radio", { name: "Cab / local" })).toHaveAttribute("aria-checked", "true");

    submit();
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(api.put).toHaveBeenCalledWith(
      "/api/expenses/expense-1",
      expect.objectContaining({ trip: "66c1884c0853f8a76a4da399", travelType: "cab" })
    );
  });

  it("puts the expense in a trip with a travel type", async () => {
    const user = userEvent.setup();
    mockExpense({ ...splitExpense, trip: null, travelType: null }, [visibleTrip]);
    render(<EditExpensePage />);

    await user.selectOptions(await screen.findByLabelText(/business trip/i), visibleTrip._id);
    await user.click(screen.getByRole("radio", { name: "Food & drinks" }));
    // The category stays as stored when editing.
    expect(screen.getByLabelText(/^category/i)).toHaveValue("category-1");

    submit();
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(api.put).toHaveBeenCalledWith(
      "/api/expenses/expense-1",
      expect.objectContaining({ trip: visibleTrip._id, travelType: "food" })
    );
  });

  it("clears the travel type when the trip is removed, and counts it as a change", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    mockExpense({ ...splitExpense, trip: { _id: visibleTrip._id, name: visibleTrip.name }, travelType: "stay" }, [
      visibleTrip,
    ]);
    render(<EditExpensePage />);

    await user.selectOptions(await screen.findByLabelText(/business trip/i), "");
    await user.click(screen.getByRole("button", { name: /back to expenses/i }));
    expect(confirmSpy).toHaveBeenCalled();
    confirmSpy.mockRestore();

    submit();
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(api.put).toHaveBeenCalledWith(
      "/api/expenses/expense-1",
      expect.objectContaining({ trip: null, travelType: null })
    );
  });
});

describe("EditExpensePage returnTo", () => {
  const tripPage = "/dashboard/trips/66c1884c0853f8a76a4da301";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ user: { _id: "66c1884c0853f8a76a4da201" }, isAdmin: true } as any);
    vi.mocked(api.put).mockResolvedValue({});
    mockExpense(splitExpense);
  });

  afterEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("goes back to the trip it was opened from on Back, Cancel and save", async () => {
    window.history.replaceState({}, "", `/dashboard/expenses/expense-1/edit?returnTo=${encodeURIComponent(tripPage)}`);
    const user = userEvent.setup();
    render(<EditExpensePage />);

    await user.click(await screen.findByRole("button", { name: /back to trip/i }));
    expect(router.push).toHaveBeenLastCalledWith(tripPage);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(router.push).toHaveBeenLastCalledWith(tripPage);

    submit();
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(router.push).toHaveBeenCalledTimes(3));
    expect(router.push).toHaveBeenLastCalledWith(tripPage);
  });

  it.each(["https://evil.example/dashboard/", "//evil.example/dashboard/", "/settings"])(
    "ignores returnTo=%s",
    async (returnTo) => {
      window.history.replaceState({}, "", `/dashboard/expenses/expense-1/edit?returnTo=${encodeURIComponent(returnTo)}`);
      render(<EditExpensePage />);

      await screen.findByLabelText(/payment source/i);
      submit();
      await waitFor(() => expect(router.push).toHaveBeenCalledWith("/dashboard/expenses"));
      expect(screen.getByRole("button", { name: /back to expenses/i })).toBeInTheDocument();
    }
  );
});
