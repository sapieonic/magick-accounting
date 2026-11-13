"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useState, useCallback, ReactNode } from "react";
import { THEME_STORAGE_KEY } from "@/lib/theme";

export { THEME_STORAGE_KEY };

export type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function readStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "dark" || stored === "light" ? stored : null;
  } catch {
    // localStorage can throw in private mode.
    return null;
  }
}

/** The saved theme, else whatever the boot script left on <html>, else light. */
function readInitialTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return readStoredTheme() ?? (document.documentElement.classList.contains("dark") ? "dark" : "light");
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

/**
 * Puts the saved theme (class + color-scheme) back on <html>. React 19 strips
 * <html> attributes when global-error replaces the root layout and again when
 * the layout comes back, so the boot script's work can't be relied on then.
 */
export function applyStoredTheme(): Theme {
  const theme = readStoredTheme() ?? "light";
  applyTheme(theme);
  return theme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readInitialTheme);

  // (Re)apply on mount, before paint: after global-error's "Try again" the
  // root layout remounts with a bare <html>, which would otherwise stay light.
  useLayoutEffect(() => {
    applyTheme(theme);
    // Only on mount; later changes go through setTheme / the storage event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep in sync if another tab toggles the theme.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== THEME_STORAGE_KEY) return;
      const next: Theme = e.newValue === "dark" ? "dark" : "light";
      setThemeState(next);
      applyTheme(next);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    applyTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // localStorage can throw in private mode — ignore.
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
