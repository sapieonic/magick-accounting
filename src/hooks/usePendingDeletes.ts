"use client";

import { useCallback, useRef } from "react";
import { UNDO_WINDOW_MS, usePendingCommits } from "@/hooks/usePendingCommits";

export { UNDO_WINDOW_MS };

/** What a page does as a scheduled delete resolves. */
export interface PendingDeleteHandlers {
  /** Undone inside the window: put the item back. */
  onUndo?: () => void;
  /** The server deleted it. */
  onDeleted?: () => void;
  /** The server refused or didn't answer: put the item back. */
  onFailed?: (error: unknown) => void;
}

/**
 * Deletes with an undo window (`usePendingCommits` keyed by id). `schedule`
 * starts the window, `undo` cancels it, and once it lapses the delete is
 * committed: the id leaves the undoable set *before* the request goes out, so
 * an Undo or a flush during the request can't un-hide it or send it twice.
 * `flush` commits every delete still in its window (and waits for those
 * already committing); it also runs on unmount.
 *
 * `hiddenIds` lists the ids scheduled or committing, for pages that hide them
 * from loaded data rather than removing them from their own state.
 */
export function usePendingDeletes(
  deleteItem: (id: string) => Promise<unknown>,
  undoWindowMs: number = UNDO_WINDOW_MS
) {
  const deleteRef = useRef(deleteItem);
  deleteRef.current = deleteItem;
  const { keys, schedule: scheduleCommit, undo, flush } = usePendingCommits(undoWindowMs);

  /** Starts the undo window; false if this id is already scheduled or committing. */
  const schedule = useCallback(
    (id: string, handlers: PendingDeleteHandlers = {}): boolean =>
      scheduleCommit(id, () => deleteRef.current(id), {
        onUndo: handlers.onUndo,
        onCommitted: () => handlers.onDeleted?.(),
        onFailed: handlers.onFailed,
      }),
    [scheduleCommit]
  );

  return { hiddenIds: keys, schedule, undo, flush };
}
