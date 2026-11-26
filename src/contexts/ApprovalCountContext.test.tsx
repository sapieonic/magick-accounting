import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { usePathname } from "next/navigation";
import { ApprovalCountProvider, useApprovalCount } from "./ApprovalCountContext";
import { api } from "@/lib/api";

vi.mock("next/navigation", () => ({ usePathname: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { get: vi.fn() } }));

function Probe() {
  const { count, pendingAmount, oldestPendingAt } = useApprovalCount();
  return <p>{`${count} · ${pendingAmount} · ${oldestPendingAt}`}</p>;
}

const calls = () => vi.mocked(api.get).mock.calls.filter(([url]) => url === "/api/expenses/approvals").length;

describe("ApprovalCountProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePathname).mockReturnValue("/dashboard");
    vi.mocked(api.get).mockResolvedValue({ pendingCount: 4, pendingAmount: 12340, oldestPendingAt: "2026-11-19T00:00:00.000Z" });
  });

  it("reads the count on mount, on route changes and when the window regains focus, without polling", async () => {
    const { rerender } = render(
      <ApprovalCountProvider enabled>
        <Probe />
      </ApprovalCountProvider>
    );
    expect(await screen.findByText("4 · 12340 · 2026-11-19T00:00:00.000Z")).toBeInTheDocument();
    expect(calls()).toBe(1);

    vi.mocked(usePathname).mockReturnValue("/dashboard/expenses");
    rerender(
      <ApprovalCountProvider enabled>
        <Probe />
      </ApprovalCountProvider>
    );
    await waitFor(() => expect(calls()).toBe(2));

    vi.mocked(api.get).mockResolvedValue({ pendingCount: 3, pendingAmount: 100, oldestPendingAt: null });
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(await screen.findByText("3 · 100 · null")).toBeInTheDocument();
    expect(calls()).toBe(3);
  });

  it("stays at zero, and never asks, for non-admins", () => {
    render(
      <ApprovalCountProvider enabled={false}>
        <Probe />
      </ApprovalCountProvider>
    );
    window.dispatchEvent(new Event("focus"));
    expect(screen.getByText("0 · 0 · null")).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });

  it("keeps the last count when a refresh fails", async () => {
    render(
      <ApprovalCountProvider enabled>
        <Probe />
      </ApprovalCountProvider>
    );
    await screen.findByText("4 · 12340 · 2026-11-19T00:00:00.000Z");
    vi.mocked(api.get).mockRejectedValue(new Error("offline"));
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(screen.getByText("4 · 12340 · 2026-11-19T00:00:00.000Z")).toBeInTheDocument();
  });

  it("is zero outside the provider", () => {
    render(<Probe />);
    expect(screen.getByText("0 · 0 · null")).toBeInTheDocument();
  });
});
