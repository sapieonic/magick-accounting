import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import TripTimeline from "./TripTimeline";
import { api } from "@/lib/api";
import type { ExpenseListItem } from "@/types/expense";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/ui/Toast", () => ({
  useToast: vi.fn(() => ({ toast: vi.fn() })),
}));

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn() },
}));

const trip = { startDate: "2026-10-12T00:00:00.000Z", endDate: "2026-10-14T00:00:00.000Z" };

function makeExpense(overrides: Partial<ExpenseListItem>): ExpenseListItem {
  return {
    _id: "e",
    title: "Expense",
    amount: 100,
    amountInBaseCurrency: 100,
    currency: { _id: "c", code: "INR", name: "Indian Rupee", symbol: "₹", isBase: true },
    date: "2026-10-12T00:00:00.000Z",
    description: "",
    paymentSource: "pocket",
    category: { _id: "cat", name: "Travel" },
    department: { _id: "dep", name: "Sales" },
    createdBy: { _id: "u1", name: "Asha Rao", email: "asha@example.com" },
    trip: { _id: "trip-1", name: "Pune" },
    travelType: null,
    ...overrides,
  };
}

const expenses = [
  makeExpense({ _id: "cab", title: "Airport cab", amount: 600, amountInBaseCurrency: 600, date: "2026-10-13T00:00:00.000Z", travelType: "cab" }),
  makeExpense({ _id: "flight", title: "Flight to Pune", amount: 5000, amountInBaseCurrency: 5000, date: "2026-09-30T00:00:00.000Z", travelType: "flight", receiptKey: "r/flight.png", receiptFilename: "flight.png" }),
  makeExpense({ _id: "lunch", title: "Team lunch", amount: 1400, amountInBaseCurrency: 1400, date: "2026-10-13T00:00:00.000Z", travelType: "food" }),
  makeExpense({ _id: "taxi", title: "Taxi home", amount: 300, amountInBaseCurrency: 300, date: "2026-10-16T00:00:00.000Z" }),
];

describe("TripTimeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockResolvedValue({ downloadUrl: "https://example.com/flight.png" });
  });

  it("lays expenses out by trip day with section totals", () => {
    render(<TripTimeline trip={trip} expenses={expenses} />);

    const sections = screen.getAllByRole("listitem");
    expect(sections.map((s) => s.getAttribute("aria-label"))).toEqual([
      "Before the trip",
      "Day 2 · Tue, 13 Oct",
      "After the trip",
    ]);
    expect(sections[1]).toHaveTextContent("Airport cab");
    expect(sections[1]).toHaveTextContent("Team lunch");
    expect(sections[1]).toHaveTextContent("₹2,000.00");
    expect(sections[2]).toHaveTextContent("Taxi home");
    expect(screen.queryByRole("button", { name: /Delete/ })).not.toBeInTheDocument();
  });

  it("opens one expense at a time and fetches its receipt lazily", async () => {
    render(<TripTimeline trip={trip} expenses={expenses} initialExpandedId="cab" />);

    const cabRow = screen.getByText("Airport cab").closest("button")!;
    expect(cabRow).toHaveAttribute("aria-expanded", "true");
    expect(api.get).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Flight to Pune"));
    expect(cabRow).toHaveAttribute("aria-expanded", "false");
    expect(await screen.findByAltText("Receipt for Flight to Pune")).toHaveAttribute(
      "src",
      "https://example.com/flight.png"
    );
    expect(api.get).toHaveBeenCalledWith("/api/upload?key=r%2Fflight.png");
  });

  it("offers remove-from-trip and delete when the caller handles them", async () => {
    const onDelete = vi.fn();
    const onRemoveFromTrip = vi.fn();
    render(
      <TripTimeline trip={trip} expenses={expenses} onDelete={onDelete} onRemoveFromTrip={onRemoveFromTrip} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove Team lunch from trip" }));
    expect(onRemoveFromTrip).toHaveBeenCalledWith(expect.objectContaining({ _id: "lunch" }));

    fireEvent.click(screen.getByText("Taxi home"));
    fireEvent.click(await screen.findByRole("button", { name: /^Delete$/ }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ _id: "taxi" })));
  });
});
