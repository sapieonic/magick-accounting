"use client";

import { useCallback, useEffect, useState } from "react";

function read(key: string): boolean | null {
  try {
    const value = window.localStorage.getItem(key);
    return value === "on" ? true : value === "off" ? false : null;
  } catch {
    return null;
  }
}

/**
 * An on/off preference kept in this browser only (a per-viewer convenience).
 * Starts at `initial` and picks up the stored value after mount; when storage
 * is unavailable (private mode, blocked site data) it still works for the
 * visit, it just isn't remembered.
 */
export function useStoredFlag(key: string, initial: boolean): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(initial);

  useEffect(() => {
    const stored = read(key);
    if (stored !== null) setValue(stored);
  }, [key]);

  const update = useCallback(
    (next: boolean) => {
      setValue(next);
      try {
        window.localStorage.setItem(key, next ? "on" : "off");
      } catch {
        // Not remembered; it still applies until the page is left.
      }
    },
    [key]
  );

  return [value, update];
}
