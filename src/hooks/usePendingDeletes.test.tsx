import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { usePendingDeletes } from "@/hooks/usePendingDeletes";

/** A DELETE the test settles by hand. */
function deferredDelete() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const deleteItem = vi.fn(
    () =>
      new Promise<void>((res, rej) => {
        resolve = res;
        reject = rej;
      })
  );
  return { deleteItem, resolve: () => resolve(), reject: (error: Error) => reject(error) };
}

describe("usePendingDeletes", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("commits once the undo window lapses and hides the id until the delete settles", async () => {
    const { deleteItem, resolve } = deferredDelete();
    const onDeleted = vi.fn();
    const { result } = renderHook(() => usePendingDeletes(deleteItem, 5000));

    act(() => {
      expect(result.current.schedule("a", { onDeleted })).toBe(true);
    });
    expect(result.current.hiddenIds).toEqual(["a"]);
    act(() => vi.advanceTimersByTime(4999));
    expect(deleteItem).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(deleteItem).toHaveBeenCalledWith("a");
    // Still hidden while the request runs.
    expect(result.current.hiddenIds).toEqual(["a"]);
    // Scheduling it again meanwhile is refused.
    expect(result.current.schedule("a")).toBe(false);

    await act(async () => resolve());
    expect(onDeleted).toHaveBeenCalledTimes(1);
    expect(result.current.hiddenIds).toEqual([]);
  });

  it("undoes inside the window without a request", () => {
    const deleteItem = vi.fn().mockResolvedValue(undefined);
    const onUndo = vi.fn();
    const { result } = renderHook(() => usePendingDeletes(deleteItem, 5000));

    act(() => void result.current.schedule("a", { onUndo }));
    act(() => {
      expect(result.current.undo("a")).toBe(true);
    });
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(result.current.hiddenIds).toEqual([]);

    act(() => vi.advanceTimersByTime(10000));
    expect(deleteItem).not.toHaveBeenCalled();
  });

  it("makes undo a no-op once the delete is committing", async () => {
    const { deleteItem, resolve } = deferredDelete();
    const onUndo = vi.fn();
    const onDeleted = vi.fn();
    const { result } = renderHook(() => usePendingDeletes(deleteItem, 5000));

    act(() => void result.current.schedule("a", { onUndo, onDeleted }));
    act(() => vi.advanceTimersByTime(5000));
    expect(deleteItem).toHaveBeenCalledTimes(1);

    // Undo while the DELETE is in flight: the item must not come back, as it is about to be deleted.
    act(() => {
      expect(result.current.undo("a")).toBe(false);
    });
    expect(onUndo).not.toHaveBeenCalled();
    expect(result.current.hiddenIds).toEqual(["a"]);

    await act(async () => resolve());
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });

  it("never sends a second DELETE when unmounted while one is in flight", async () => {
    const { deleteItem, resolve } = deferredDelete();
    const { result, unmount } = renderHook(() => usePendingDeletes(deleteItem, 5000));

    act(() => void result.current.schedule("a"));
    act(() => vi.advanceTimersByTime(5000));
    expect(deleteItem).toHaveBeenCalledTimes(1);

    unmount();
    await act(async () => resolve());
    expect(deleteItem).toHaveBeenCalledTimes(1);
  });

  it("commits deletes still in their window on unmount, once each", async () => {
    const deleteItem = vi.fn().mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() => usePendingDeletes(deleteItem, 5000));

    act(() => {
      result.current.schedule("a");
      result.current.schedule("b");
    });
    unmount();
    expect(deleteItem.mock.calls).toEqual([["a"], ["b"]]);

    // Their timers were cleared: nothing more when the window would have lapsed.
    await act(async () => vi.advanceTimersByTime(5000));
    expect(deleteItem).toHaveBeenCalledTimes(2);
  });

  it("flush commits pending deletes and waits for those already in flight", async () => {
    const inFlight = deferredDelete();
    const deleteItem = vi.fn((id: string) => (id === "a" ? inFlight.deleteItem() : Promise.resolve()));
    const { result } = renderHook(() => usePendingDeletes(deleteItem, 5000));

    act(() => void result.current.schedule("a"));
    act(() => vi.advanceTimersByTime(5000));
    act(() => void result.current.schedule("b"));

    let flushed = false;
    await act(async () => {
      void result.current.flush().then(() => {
        flushed = true;
      });
    });
    expect(deleteItem.mock.calls).toEqual([["a"], ["b"]]);
    // "a" is still in flight, so the flush isn't done.
    expect(flushed).toBe(false);

    await act(async () => inFlight.resolve());
    expect(flushed).toBe(true);
    expect(result.current.hiddenIds).toEqual([]);
  });

  it("reports a failed delete and stops hiding the id", async () => {
    const { deleteItem, reject } = deferredDelete();
    const onFailed = vi.fn();
    const onDeleted = vi.fn();
    const { result } = renderHook(() => usePendingDeletes(deleteItem, 5000));

    act(() => void result.current.schedule("a", { onDeleted, onFailed }));
    act(() => vi.advanceTimersByTime(5000));
    await act(async () => reject(new Error("offline")));

    expect(onFailed).toHaveBeenCalledWith(expect.objectContaining({ message: "offline" }));
    expect(onDeleted).not.toHaveBeenCalled();
    expect(result.current.hiddenIds).toEqual([]);
    // It can be deleted again.
    act(() => {
      expect(result.current.schedule("a")).toBe(true);
    });
  });
});
