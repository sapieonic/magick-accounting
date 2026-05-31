import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider, useToast } from "@/components/ui/Toast";

function Harness() {
  const { toast } = useToast();
  return (
    <div>
      <button onClick={() => toast("Saved!")}>fire success</button>
      <button onClick={() => toast("Boom", "error")}>fire error</button>
    </div>
  );
}

describe("Toast", () => {
  it("throws when useToast is used outside a ToastProvider", () => {
    // Suppress the expected React error boundary console noise.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    function Orphan() {
      useToast();
      return null;
    }
    expect(() => render(<Orphan />)).toThrow(/useToast must be used within a ToastProvider/);
    spy.mockRestore();
  });

  describe("with fake timers", () => {
    beforeEach(() => {
      // shouldAdvanceTime lets user-event's internal delays resolve while we
      // still control the component's 4s auto-dismiss timer explicitly.
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });
    afterEach(() => {
      // Flush the lingering 4s auto-dismiss timer inside act so its state
      // update doesn't leak past the test (avoids an act() warning).
      act(() => {
        vi.runOnlyPendingTimers();
      });
      vi.useRealTimers();
    });

    it("shows a toast message when toast() is called and auto-dismisses after 4s", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(
        <ToastProvider>
          <Harness />
        </ToastProvider>
      );

      await user.click(screen.getByRole("button", { name: "fire success" }));
      expect(screen.getByText("Saved!")).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(4000);
      });
      expect(screen.queryByText("Saved!")).not.toBeInTheDocument();
    });

    it("can be dismissed manually via the dismiss button", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(
        <ToastProvider>
          <Harness />
        </ToastProvider>
      );

      await user.click(screen.getByRole("button", { name: "fire error" }));
      expect(screen.getByText("Boom")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /dismiss notification/i }));
      expect(screen.queryByText("Boom")).not.toBeInTheDocument();
    });
  });
});
