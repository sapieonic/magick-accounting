import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EditExpensePage from "./page";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError, api } from "@/lib/api";

/**
 * The innermost Notice whose text includes `text`. Notices are found by their
 * `data-notice` marker, or by the live role they had before it, so the test
 * doesn't depend on which one the primitive uses.
 */
function queryNotice(text: string): HTMLElement | null {
  const notices = [...document.querySelectorAll<HTMLElement>("[data-notice], [role=status]")].filter((el) =>
    el.textContent?.includes(text)
  );
  // The innermost match: a notice, not a region that happens to contain one.
  return notices.find((el) => !notices.some((other) => other !== el && el.contains(other))) ?? null;
}

async function findNotice(text: string): Promise<HTMLElement> {
  return waitFor(() => {
    const notice = queryNotice(text);
    if (!notice) throw new Error(`No notice containing "${text}"`);
    return notice;
  });
}

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

vi.mock("@/lib/api", async (importOriginal) => ({
  ApiError: (await importOriginal<typeof import("@/lib/api")>()).ApiError,
  api: {
    get: vi.fn(),
    put: vi.fn(),
    post: vi.fn(),
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

/** A "Who paid" option (the segmented "Payment source" control). */
function sourceButton(name: string) {
  return within(screen.getByRole("group", { name: /payment source/i })).getByRole("button", { name });
}

async function findSourceButton(name: string) {
  return within(await screen.findByRole("group", { name: /payment source/i })).getByRole("button", { name });
}

function submit() {
  fireEvent.submit(screen.getByRole("button", { name: "Save changes" }).closest("form")!);
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

    expect(await findSourceButton("Split")).toHaveAttribute("aria-pressed", "true");
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

    await user.click(await findSourceButton("Split"));
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
    await user.click(sourceButton("Company"));
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

    await screen.findByRole("group", { name: /payment source/i });
    await user.click(sourceButton("Several people"));
    expect(screen.getByLabelText("Payer 1")).toBeInTheDocument();
    await user.click(sourceButton("Pocket"));
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

      await screen.findByRole("group", { name: /payment source/i });
      submit();
      await waitFor(() => expect(router.push).toHaveBeenCalledWith("/dashboard/expenses"));
      expect(screen.getByRole("button", { name: /back to expenses/i })).toBeInTheDocument();
    }
  );
});

describe("EditExpensePage linked assets", () => {
  const linked = [{ _id: "asset-1", assetTag: "AST-001", name: "MacBook Pro", allocatedAmount: 900 }];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.startsWith("/api/expenses/")) {
        return Promise.resolve({ expense: { ...splitExpense, receiptKey: "receipts/r.png" }, assets: linked });
      }
      if (url.startsWith("/api/lookups")) {
        return Promise.resolve({
          departments: [{ _id: "department-1", name: "Engineering" }],
          categories: [{ _id: "category-1", name: "Meals & Entertainment" }],
          currencies: [{ _id: "currency-1", code: "INR", name: "Indian Rupee", symbol: "₹", isBase: true }],
        });
      }
      return Promise.resolve({ trips: [] });
    });
  });

  it("locks the accounting fields for non-admins", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { _id: "u1" }, isAdmin: false } as any);
    render(<EditExpensePage />);

    expect(await screen.findByRole("link", { name: /macbook pro/i })).toHaveAttribute("href", "/dashboard/assets/asset-1");
    expect(screen.getByLabelText(/^amount/i)).toBeDisabled();
    expect(screen.getByLabelText("Currency")).toBeDisabled();
    expect(sourceButton("Pocket")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove receipt" })).toBeDisabled();
    expect(screen.getByLabelText(/^title/i)).toBeEnabled();
    expect(screen.queryByRole("link", { name: /add more assets/i })).not.toBeInTheDocument();
  });

  it("lets admins edit and add more assets, with the currency still fixed", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { _id: "u1" }, isAdmin: true } as any);
    render(<EditExpensePage />);

    expect(await screen.findByRole("link", { name: /add more assets/i })).toHaveAttribute(
      "href",
      "/dashboard/expenses/expense-1/assets/new"
    );
    expect(screen.getByLabelText(/^amount/i)).toBeEnabled();
    expect(screen.getByLabelText("Currency")).toBeDisabled();
  });
});

describe("EditExpensePage INR preview", () => {
  const inr = { _id: "currency-1", code: "INR", name: "Indian Rupee", symbol: "₹", isBase: true, rateToBase: 1 };
  const usd = { _id: "currency-2", code: "USD", name: "US Dollar", symbol: "$", isBase: false, rateToBase: 90 };
  const eur = { _id: "currency-3", code: "EUR", name: "Euro", symbol: "€", isBase: false, rateToBase: 95 };
  // Saved at 80 to the dollar; today's rate is 90.
  const usdExpense = {
    ...splitExpense,
    paymentSource: "company",
    amount: 100,
    amountInBaseCurrency: 8000,
    exchangeRateToBase: 80,
    currency: usd,
  };

  function mockWith(expense: Record<string, unknown>, currencies: unknown[]) {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.startsWith("/api/expenses/")) return Promise.resolve({ expense, assets: [] });
      if (url.startsWith("/api/lookups")) {
        return Promise.resolve({
          departments: [{ _id: "department-1", name: "Engineering" }],
          categories: [{ _id: "category-1", name: "Meals & Entertainment" }],
          currencies,
        });
      }
      return Promise.resolve({ trips: [] });
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ user: { _id: "u1" }, isAdmin: true } as any);
  });

  it("previews with the saved rate while the currency is unchanged, and today's rate after a change", async () => {
    const user = userEvent.setup();
    mockWith(usdExpense, [inr, usd, eur]);
    render(<EditExpensePage />);

    expect(await screen.findByText(/≈ ₹8,000\.00 at this expense's saved USD rate/)).toBeInTheDocument();

    const amount = screen.getByLabelText(/^amount/i);
    await user.clear(amount);
    await user.type(amount, "10.555");
    // 10.555 × 80 = 844.4, rounded to paise like the server.
    expect(screen.getByText(/≈ ₹844\.40 at this expense's saved USD rate/)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Currency"), eur._id);
    expect(screen.getByText(/≈ ₹1,002\.73 at today's rate/)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Currency"), usd._id);
    expect(screen.getByText(/at this expense's saved USD rate/)).toBeInTheDocument();
  });

  it("derives the saved rate from the stored INR amount on older expenses", async () => {
    mockWith({ ...usdExpense, exchangeRateToBase: undefined, amountInBaseCurrency: 7500 }, [inr, usd]);
    render(<EditExpensePage />);

    expect(await screen.findByText(/≈ ₹7,500\.00 at this expense's saved USD rate/)).toBeInTheDocument();
  });

  it("keeps a deactivated currency selectable and totals in it", async () => {
    mockWith(usdExpense, [inr]);
    render(<EditExpensePage />);

    const select = (await screen.findByLabelText("Currency")) as HTMLSelectElement;
    expect(select).toHaveValue(usd._id);
    expect(select.selectedOptions[0]).toHaveTextContent("USD $");
    expect(screen.getByText(/≈ ₹8,000\.00 at this expense's saved USD rate/)).toBeInTheDocument();
    expect(screen.queryByText(/base currency, no conversion/i)).not.toBeInTheDocument();
    expect(screen.getByText("$100.00")).toBeInTheDocument();
  });
});

describe("EditExpensePage pocket credit wording", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("credits the submitter by name when an admin edits someone else's expense", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { _id: "admin-1" }, isAdmin: true } as any);
    mockExpense({ ...splitExpense, paymentSource: "pocket", createdBy: { _id: "user-2", name: "Ravi" } });
    render(<EditExpensePage />);

    expect(await screen.findByText("The full ₹1,000.00 is credited to Ravi for reimbursement.")).toBeInTheDocument();
  });

  it("says 'you' on your own expense", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { _id: "user-2" }, isAdmin: false } as any);
    mockExpense({ ...splitExpense, paymentSource: "pocket", createdBy: { _id: "user-2", name: "Ravi" } });
    render(<EditExpensePage />);

    expect(await screen.findByText("The full ₹1,000.00 is credited to you for reimbursement.")).toBeInTheDocument();
  });
});

describe("EditExpensePage approval", () => {
  const asha = { _id: "66c1884c0853f8a76a4da201", name: "Asha", email: "asha@example.com" };
  const priya = { _id: "66c1884c0853f8a76a4da209", name: "Priya", email: "priya@example.com" };
  const ownExpense = { ...splitExpense, paymentSource: "company", pocketAmount: 0, createdBy: asha };
  const rejected = {
    ...ownExpense,
    approvalStatus: "rejected",
    reviewedBy: priya,
    reviewedAt: "2026-11-12T10:00:00.000Z",
    rejectionReason: "Receipt missing",
    approvalHistory: [
      { action: "submitted", by: asha, at: "2026-11-10T09:00:00.000Z", note: null },
      { action: "rejected", by: priya, at: "2026-11-12T10:00:00.000Z", note: "Receipt missing" },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ user: asha, isAdmin: false } as any);
    vi.mocked(api.put).mockResolvedValue({ expense: { approvalStatus: "pending" } });
  });

  function submitButton(name: string | RegExp) {
    return screen.getByRole("button", { name });
  }

  it("tells the submitter who rejected it, why, and what to do, and resubmits on save", async () => {
    const user = userEvent.setup();
    mockExpense(rejected);
    render(<EditExpensePage />);

    const notice = await findNotice("Rejected by Priya");
    expect(notice).toHaveTextContent("Rejected by Priya · 12 Nov 2026");
    expect(within(notice).getByText("Receipt missing")).toBeInTheDocument();
    expect(notice).toHaveTextContent("What next: fix the details below and resubmit it, or delete it if it was a mistake.");

    // A fix first: the save itself resubmits it.
    await user.type(screen.getByLabelText(/^description/i), "Receipt attached");
    expect(screen.getByText(/saving resubmits this expense/i)).toBeInTheDocument();
    await user.click(submitButton("Resubmit for approval"));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(api.post).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith("Resubmitted. An admin will review it again.");
  });

  it("resubmits an unchanged rejected expense as is, through the approval route", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ expense: { ...rejected, approvalStatus: "pending" } });
    mockExpense({ ...rejected, assetAllocationRevision: 4 });
    render(<EditExpensePage />);

    await findNotice("Rejected by Priya");
    // Says what an unchanged resubmit means before it's pressed.
    expect(screen.getByText(/you haven't changed anything, so this sends it back as it is/i)).toBeInTheDocument();
    await user.click(submitButton("Resubmit for approval"));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/api/expenses/expense-1/approval", { action: "resubmit", revision: 4 })
    );
    expect(api.put).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith("Resubmitted. An admin will review it again.");
    expect(router.push).toHaveBeenCalledWith("/dashboard/expenses");
  });

  it("sends the loaded revision with the save", async () => {
    const user = userEvent.setup();
    mockExpense({ ...ownExpense, approvalStatus: "pending", assetAllocationRevision: 7 });
    render(<EditExpensePage />);

    await user.type(await screen.findByLabelText(/^title/i), " (taxi)");
    await user.click(submitButton("Save changes"));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(api.put).toHaveBeenCalledWith("/api/expenses/expense-1", expect.objectContaining({ revision: 7 }));
  });

  it("re-reads a conflicting save, keeps the edits, shows the new status and explains", async () => {
    const user = userEvent.setup();
    const pending = { ...ownExpense, approvalStatus: "pending", assetAllocationRevision: 2 };
    // An admin rejected it while the form was open.
    const rejectedMeanwhile = { ...rejected, assetAllocationRevision: 3 };
    let reads = 0;
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.startsWith("/api/expenses/")) {
        reads += 1;
        return Promise.resolve({ expense: reads === 1 ? pending : rejectedMeanwhile, assets: [] });
      }
      if (url.startsWith("/api/lookups")) {
        return Promise.resolve({
          departments: [{ _id: "department-1", name: "Engineering" }],
          categories: [{ _id: "category-1", name: "Meals & Entertainment" }],
          currencies: [{ _id: "currency-1", code: "INR", name: "Indian Rupee", symbol: "₹", isBase: true }],
        });
      }
      return Promise.resolve({ trips: [] });
    });
    vi.mocked(api.put).mockRejectedValueOnce(
      new ApiError("This expense changed while you were editing it", 409, { code: "stale", approvalStatus: "rejected" })
    );
    render(<EditExpensePage />);

    await findNotice("Awaiting approval");
    const amount = screen.getByLabelText(/^amount/i);
    await user.clear(amount);
    await user.type(amount, "1200");
    await user.click(submitButton("Save changes"));

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        "An admin rejected this while you were editing. Your changes aren't saved yet: review them and save again.",
        "error"
      )
    );
    expect(router.push).not.toHaveBeenCalled();
    // The Notice now says why it was rejected; the edit is still there.
    const notice = await findNotice("Rejected by Priya");
    expect(within(notice).getByText("Receipt missing")).toBeInTheDocument();
    expect(screen.getByLabelText(/^amount/i)).toHaveValue(1200);
    expect(submitButton("Resubmit for approval")).toBeInTheDocument();

    // Saving again sends the new revision, and the toast follows the server's answer.
    vi.mocked(api.put).mockResolvedValueOnce({ expense: { approvalStatus: "pending" } });
    await user.click(submitButton("Resubmit for approval"));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(2));
    expect(api.put).toHaveBeenLastCalledWith("/api/expenses/expense-1", expect.objectContaining({ revision: 3, amount: 1200 }));
    expect(toastMock).toHaveBeenLastCalledWith("Resubmitted. An admin will review it again.");
  });

  /** The expense reads as `first`, then (re-read after a conflict) as `second`. */
  function mockConflict(first: Record<string, unknown>, second: Record<string, unknown>) {
    let reads = 0;
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.startsWith("/api/expenses/")) {
        reads += 1;
        return Promise.resolve({ expense: reads === 1 ? first : second, assets: [] });
      }
      if (url.startsWith("/api/lookups")) {
        return Promise.resolve({
          departments: [{ _id: "department-1", name: "Engineering" }],
          categories: [{ _id: "category-1", name: "Meals & Entertainment" }],
          currencies: [{ _id: "currency-1", code: "INR", name: "Indian Rupee", symbol: "₹", isBase: true }],
        });
      }
      return Promise.resolve({ trips: [] });
    });
    vi.mocked(api.put).mockRejectedValueOnce(
      new ApiError("This expense changed while you were editing it", 409, { code: "stale", approvalStatus: "approved" })
    );
  }

  it("after a conflict, takes someone else's fix to a field the person didn't touch, and keeps their own edit", async () => {
    const user = userEvent.setup();
    const approved = { ...ownExpense, approvalStatus: "approved", assetAllocationRevision: 2 };
    // Meanwhile an admin corrected the amount and put it in a trip.
    const corrected = {
      ...approved,
      amount: 1500,
      amountInBaseCurrency: 1500,
      trip: { _id: "66c1884c0853f8a76a4da399", name: "Mumbai client visit" },
      travelType: "food",
      assetAllocationRevision: 3,
    };
    mockConflict(approved, corrected);
    render(<EditExpensePage />);

    await user.type(await screen.findByLabelText(/^title/i), " with client");
    await user.click(submitButton("Save changes"));

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        "Someone else saved this expense while you were editing. Your changes aren't saved yet: review them and save again.",
        "error"
      )
    );
    // The untouched amount and trip now show the saved values; the title edit is kept.
    await waitFor(() => expect(screen.getByLabelText(/^amount/i)).toHaveValue(1500));
    expect(screen.getByLabelText(/^title/i)).toHaveValue("Client dinner with client");
    const trip = screen.getByLabelText(/business trip/i) as HTMLSelectElement;
    expect(trip).toHaveValue("66c1884c0853f8a76a4da399");
    expect(trip.selectedOptions[0]).toHaveTextContent("Mumbai client visit");
    expect(queryNotice("Also changed by someone else")).toBeNull();
    // Nothing accounting-related differs from the saved version, so it stays approved.
    expect(submitButton("Save changes")).toBeInTheDocument();

    vi.mocked(api.put).mockResolvedValueOnce({ expense: { approvalStatus: "approved" } });
    await user.click(submitButton("Save changes"));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(2));
    expect(api.put).toHaveBeenLastCalledWith(
      "/api/expenses/expense-1",
      expect.objectContaining({
        revision: 3,
        title: "Client dinner with client",
        amount: 1500,
        trip: "66c1884c0853f8a76a4da399",
        travelType: "food",
      })
    );
    expect(toastMock).toHaveBeenLastCalledWith("Expense updated");
  });

  it("after a conflict, keeps the person's value for a field both changed, and asks them to check it", async () => {
    const user = userEvent.setup();
    const approved = { ...ownExpense, approvalStatus: "approved", assetAllocationRevision: 2 };
    const corrected = { ...approved, amount: 1500, amountInBaseCurrency: 1500, description: "Corrected by Priya", assetAllocationRevision: 3 };
    mockConflict(approved, corrected);
    render(<EditExpensePage />);

    const amount = await screen.findByLabelText(/^amount/i);
    await user.clear(amount);
    await user.type(amount, "1200");
    await user.click(submitButton("Save & resubmit"));

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        "Someone else saved this expense while you were editing. Your changes aren't saved yet: review them and save again. Amount was also changed by someone else — check it before saving.",
        "error"
      )
    );
    const notice = await findNotice("Also changed by someone else");
    expect(notice).toHaveTextContent("Amount was also changed by someone else — check it before saving.");
    expect(screen.getByLabelText(/^amount/i)).toHaveValue(1200);
    // The field only someone else changed takes their value.
    expect(screen.getByLabelText(/^description/i)).toHaveValue("Corrected by Priya");
    // 1200 differs from the saved 1500: still an accounting change.
    expect(submitButton("Save & resubmit")).toBeInTheDocument();

    vi.mocked(api.put).mockResolvedValueOnce({ expense: { approvalStatus: "pending" } });
    await user.click(submitButton("Save & resubmit"));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(2));
    expect(api.put).toHaveBeenLastCalledWith(
      "/api/expenses/expense-1",
      expect.objectContaining({ revision: 3, amount: 1200, description: "Corrected by Priya" })
    );
  });

  it("builds the save message from the server's answer, not the loaded status", async () => {
    const user = userEvent.setup();
    // Loaded approved, title-only change: the server still says it went back for approval.
    vi.mocked(api.put).mockResolvedValue({ expense: { approvalStatus: "pending" } });
    mockExpense({ ...ownExpense, approvalStatus: "approved" });
    render(<EditExpensePage />);

    await user.type(await screen.findByLabelText(/^title/i), " with client");
    await user.click(submitButton("Save changes"));
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith("Saved and sent back for approval. An admin will review your changes.")
    );
  });

  it("tells an admin editing their own pending expense that another admin reviews it", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: asha, isAdmin: true } as any);
    mockExpense({ ...ownExpense, approvalStatus: "pending" });
    render(<EditExpensePage />);

    const notice = await findNotice("Awaiting approval");
    expect(notice).toHaveTextContent("Another admin needs to review this — you can't approve your own expense.");
    expect(within(notice).queryByRole("link", { name: /review it in approvals/i })).not.toBeInTheDocument();
  });

  it("links another admin to the queue with a full-size target", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: priya, isAdmin: true } as any);
    mockExpense({ ...ownExpense, approvalStatus: "pending" });
    render(<EditExpensePage />);

    const notice = await findNotice("Awaiting approval");
    const link = within(notice).getByRole("link", { name: "Review it in Approvals" });
    expect(link).toHaveAttribute("href", "/dashboard/approvals");
    expect(link).toHaveClass("min-h-10");
  });

  it("shows the server's edit notes in the history as events, not as quotes", async () => {
    mockExpense({
      ...ownExpense,
      approvalStatus: "pending",
      approvalHistory: [
        ...rejected.approvalHistory,
        { action: "resubmitted", by: asha, at: "2026-11-13T09:00:00.000Z", note: "Edited after rejection" },
        { action: "reopened", by: priya, at: "2026-11-14T09:00:00.000Z", note: null },
      ],
    });
    render(<EditExpensePage />);

    const history = await screen.findByRole("region", { name: "Approval history" });
    const items = within(history).getAllByRole("listitem");
    expect(items[2]).toHaveTextContent("Resubmitted · Asha · 13 Nov 2026");
    expect(items[2]).toHaveTextContent("Asha edited it after it was rejected.");
    expect(items[2]).not.toHaveTextContent("“");
    expect(items[3]).toHaveTextContent("Moved back to review · Priya · 14 Nov 2026");
  });

  it("lists the approval history, read-only", async () => {
    mockExpense(rejected);
    render(<EditExpensePage />);

    const history = await screen.findByRole("region", { name: "Approval history" });
    const items = within(history).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Submitted · Asha · 10 Nov 2026");
    expect(items[1]).toHaveTextContent("Rejected · Priya · 12 Nov 2026");
    expect(items[1]).toHaveTextContent("“Receipt missing”");
    expect(within(history).queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("switches to 'Save & resubmit' only while an accounting field differs on an approved expense", async () => {
    const user = userEvent.setup();
    mockExpense({ ...ownExpense, approvalStatus: "approved" });
    render(<EditExpensePage />);

    expect(await screen.findByText("This expense is approved")).toBeInTheDocument();
    expect(submitButton("Save changes")).toBeInTheDocument();

    // A title isn't an accounting field.
    await user.type(screen.getByLabelText(/^title/i), " with client");
    expect(submitButton("Save changes")).toBeInTheDocument();

    const amount = screen.getByLabelText(/^amount/i);
    await user.clear(amount);
    await user.type(amount, "1200");
    expect(submitButton("Save & resubmit")).toBeInTheDocument();
    expect(screen.getByText(/saving sends this expense back to an admin/i)).toBeInTheDocument();

    // Back to the stored amount: nothing to re-approve.
    await user.clear(amount);
    await user.type(amount, "1000");
    expect(submitButton("Save changes")).toBeInTheDocument();

    await user.clear(amount);
    await user.type(amount, "1200");
    await user.click(submitButton("Save & resubmit"));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(toastMock).toHaveBeenCalledWith("Saved and sent back for approval. An admin will review your changes.");
  });

  it("counts a new receipt as an accounting change", async () => {
    const user = userEvent.setup();
    mockExpense({ ...ownExpense, receiptKey: "receipts/r.png", receiptFilename: "r.png" });
    render(<EditExpensePage />);

    await user.click(await screen.findByRole("button", { name: "Remove receipt" }));
    expect(submitButton("Save & resubmit")).toBeInTheDocument();
  });

  it("keeps a pending expense pending and says so", async () => {
    const user = userEvent.setup();
    mockExpense({ ...ownExpense, approvalStatus: "pending" });
    render(<EditExpensePage />);

    const notice = await findNotice("Awaiting approval");
    expect(notice).toHaveTextContent("Your changes will be reviewed along with it.");

    const amount = screen.getByLabelText(/^amount/i);
    await user.clear(amount);
    await user.type(amount, "1200");
    await user.click(submitButton("Save changes"));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(toastMock).toHaveBeenCalledWith("Changes saved. It's still awaiting approval.");
  });

  it("explains that assets wait for approval instead of offering to create them", async () => {
    mockExpense({ ...ownExpense, approvalStatus: "pending" });
    render(<EditExpensePage />);

    expect(await screen.findByText("You can register assets for this purchase once it's approved.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /create assets/i })).not.toBeInTheDocument();
  });

  it("never relabels an admin's save, which doesn't change the status", async () => {
    const user = userEvent.setup();
    vi.mocked(useAuth).mockReturnValue({ user: priya, isAdmin: true } as any);
    vi.mocked(api.put).mockResolvedValue({ expense: { approvalStatus: "rejected" } });
    mockExpense(rejected);
    render(<EditExpensePage />);

    const notice = await findNotice("Saving changes doesn");
    expect(notice).toHaveTextContent("Saving changes doesn't change its status. Asha can fix and resubmit it.");
    const amount = screen.getByLabelText(/^amount/i);
    await user.clear(amount);
    await user.type(amount, "1200");
    await user.click(submitButton("Save changes"));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(toastMock).toHaveBeenCalledWith("Expense updated");
  });
});
