import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { usePendingCommits } from "@/hooks/usePendingCommits";

describe("usePendingCommits", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs each key's own request after the window and hands over its result", async () => {
    const onCommitted = vi.fn();
    const run = vi.fn().mockResolvedValue({ done: ["a", "b"] });
    const { result } = renderHook(() => usePendingCommits(5000));

    act(() => {
      expect(result.current.schedule("batch:1", run, { onCommitted })).toBe(true);
    });
    expect(result.current.keys).toEqual(["batch:1"]);
    expect(run).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTime(5000));
    expect(run).toHaveBeenCalledTimes(1);
    expect(onCommitted).toHaveBeenCalledWith({ done: ["a", "b"] });
    expect(result.current.keys).toEqual([]);
  });

  it("undoes without running, and flushes on unmount", async () => {
    const first = vi.fn().mockResolvedValue(undefined);
    const second = vi.fn().mockResolvedValue(undefined);
    const onUndo = vi.fn();
    const { result, unmount } = renderHook(() => usePendingCommits(5000));

    act(() => {
      result.current.schedule("a", first, { onUndo });
      result.current.schedule("b", second);
    });
    act(() => {
      expect(result.current.undo("a")).toBe(true);
    });
    expect(onUndo).toHaveBeenCalledTimes(1);

    unmount();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("says when a flush sends a request early, after which Undo is refused", async () => {
    const run = vi.fn().mockResolvedValue("ok");
    const onSent = vi.fn();
    const onUndo = vi.fn();
    const { result } = renderHook(() => usePendingCommits(5000));

    act(() => {
      result.current.schedule("a", run, { onSent, onUndo });
    });
    expect(onSent).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.flush();
    });
    expect(onSent).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(1);
    act(() => {
      expect(result.current.undo("a")).toBe(false);
    });
    expect(onUndo).not.toHaveBeenCalled();
  });
});
