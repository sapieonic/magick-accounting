"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const UNDO_WINDOW_MS = 5000;

/** What a page does as a scheduled commit resolves. */
export interface PendingCommitHandlers<T = unknown> {
  /** Undone inside the window: put things back. */
  onUndo?: () => void;
  /**
   * The window is over (it lapsed, or a flush sent it early) and the request
   * is going out: Undo no longer applies, so close whatever offered it.
   */
  onSent?: () => void;
  /** The request succeeded, with its result. */
  onCommitted?: (result: T) => void;
  /** The request was refused or didn't answer: put things back. */
  onFailed?: (error: unknown) => void;
}

interface Entry {
  timer: ReturnType<typeof setTimeout>;
  run: () => Promise<unknown>;
  handlers: PendingCommitHandlers<unknown>;
}

/**
 * Deferred requests with an undo window (deletes, approvals). `schedule`
 * starts the window for a key, `undo` cancels it, and once it lapses `run` is
 * sent: the key leaves the undoable set *before* the request goes out, so an
 * Undo or a flush during the request can't restore it or send it twice.
 * `flush` sends everything still in its window (and waits for what is already
 * in flight); it also runs on unmount.
 *
 * `keys` lists the keys scheduled or in flight, for pages that hide (or
 * re-label) those items rather than changing their own state.
 */
export function usePendingCommits(undoWindowMs: number = UNDO_WINDOW_MS) {
  const pending = useRef(new Map<string, Entry>());
  const committing = useRef(new Map<string, Promise<void>>());
  const [keys, setKeys] = useState<string[]>([]);

  const sync = useCallback(() => {
    setKeys([...pending.current.keys(), ...committing.current.keys()]);
  }, []);

  const commit = useCallback(
    (key: string): Promise<void> => {
      const entry = pending.current.get(key);
      if (!entry) return committing.current.get(key) ?? Promise.resolve();
      clearTimeout(entry.timer);
      // Out of the undo window before the request: no undo or resend from here.
      pending.current.delete(key);
      entry.handlers.onSent?.();
      const request = (async () => {
        try {
          const result = await entry.run();
          entry.handlers.onCommitted?.(result);
        } catch (error) {
          entry.handlers.onFailed?.(error);
        } finally {
          committing.current.delete(key);
          sync();
        }
      })();
      committing.current.set(key, request);
      return request;
    },
    [sync]
  );

  /** Starts the undo window; false if this key is already scheduled or in flight. */
  const schedule = useCallback(
    <T,>(key: string, run: () => Promise<T>, handlers: PendingCommitHandlers<T> = {}): boolean => {
      if (pending.current.has(key) || committing.current.has(key)) return false;
      const timer = setTimeout(() => void commit(key), undoWindowMs);
      pending.current.set(key, { timer, run, handlers: handlers as PendingCommitHandlers<unknown> });
      sync();
      return true;
    },
    [commit, sync, undoWindowMs]
  );

  /** Cancels a commit still in its window; false (and nothing happens) once it is in flight. */
  const undo = useCallback(
    (key: string): boolean => {
      const entry = pending.current.get(key);
      if (!entry) return false;
      clearTimeout(entry.timer);
      pending.current.delete(key);
      sync();
      entry.handlers.onUndo?.();
      return true;
    },
    [sync]
  );

  /** Sends every commit still in its window and waits for all in flight. */
  const flush = useCallback(async () => {
    [...pending.current.keys()].forEach((key) => void commit(key));
    await Promise.all(committing.current.values());
  }, [commit]);

  useEffect(
    () => () => {
      void flush();
    },
    [flush]
  );

  return { keys, schedule, undo, flush };
}
