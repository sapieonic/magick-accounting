"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const UNDO_WINDOW_MS = 5000;

/** What a page does as a scheduled delete resolves. */
export interface PendingDeleteHandlers {
  /** Undone inside the window: put the item back. */
  onUndo?: () => void;
  /** The server deleted it. */
  onDeleted?: () => void;
  /** The server refused or didn't answer: put the item back. */
  onFailed?: (error: unknown) => void;
}

interface Entry {
  timer: ReturnType<typeof setTimeout>;
  handlers: PendingDeleteHandlers;
}

/**
 * Deletes with an undo window. `schedule` starts the window, `undo` cancels it,
 * and once it lapses the delete is committed: the id leaves the undoable set
 * *before* the request goes out, so an Undo or a flush during the request
 * can't un-hide it or send it twice. `flush` commits every delete still in its
 * window (and waits for those already committing); it also runs on unmount.
 *
 * `hiddenIds` lists the ids scheduled or committing, for pages that hide them
 * from loaded data rather than removing them from their own state.
 */
export function usePendingDeletes(
  deleteItem: (id: string) => Promise<unknown>,
  undoWindowMs: number = UNDO_WINDOW_MS
) {
  const pending = useRef(new Map<string, Entry>());
  const committing = useRef(new Map<string, Promise<void>>());
  const deleteRef = useRef(deleteItem);
  deleteRef.current = deleteItem;
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);

  const sync = useCallback(() => {
    setHiddenIds([...pending.current.keys(), ...committing.current.keys()]);
  }, []);

  const commit = useCallback(
    (id: string): Promise<void> => {
      const entry = pending.current.get(id);
      if (!entry) return committing.current.get(id) ?? Promise.resolve();
      clearTimeout(entry.timer);
      // Out of the undo window before the request: no undo or resend from here.
      pending.current.delete(id);
      const request = (async () => {
        try {
          await deleteRef.current(id);
          entry.handlers.onDeleted?.();
        } catch (error) {
          entry.handlers.onFailed?.(error);
        } finally {
          committing.current.delete(id);
          sync();
        }
      })();
      committing.current.set(id, request);
      return request;
    },
    [sync]
  );

  /** Starts the undo window; false if this id is already scheduled or committing. */
  const schedule = useCallback(
    (id: string, handlers: PendingDeleteHandlers = {}): boolean => {
      if (pending.current.has(id) || committing.current.has(id)) return false;
      const timer = setTimeout(() => void commit(id), undoWindowMs);
      pending.current.set(id, { timer, handlers });
      sync();
      return true;
    },
    [commit, sync, undoWindowMs]
  );

  /** Cancels a delete still in its window; false (and nothing happens) once it is committing. */
  const undo = useCallback(
    (id: string): boolean => {
      const entry = pending.current.get(id);
      if (!entry) return false;
      clearTimeout(entry.timer);
      pending.current.delete(id);
      sync();
      entry.handlers.onUndo?.();
      return true;
    },
    [sync]
  );

  /** Commits every delete still in its window and waits for all in flight. */
  const flush = useCallback(async () => {
    [...pending.current.keys()].forEach((id) => void commit(id));
    await Promise.all(committing.current.values());
  }, [commit]);

  useEffect(
    () => () => {
      void flush();
    },
    [flush]
  );

  return { hiddenIds, schedule, undo, flush };
}
