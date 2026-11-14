/**
 * Theme constants shared by the server-rendered shells and ThemeContext.
 * Plain module (no "use client"), so server components get the real string.
 */

/** localStorage key holding the saved theme ("light" | "dark"). */
export const THEME_STORAGE_KEY = "theme";

/**
 * Inline script for <head>: runs before first paint so <html> already has the
 * saved theme's `dark` class and color-scheme (no light flash on a dark theme).
 * Only consults localStorage; the default is light. Used by the root layout and
 * by global-error, which replaces the root layout and renders its own <html>.
 */
export const THEME_BOOT_SCRIPT = `
(function() {
  try {
    var stored = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    var theme = stored === 'dark' ? 'dark' : 'light';
    var root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    root.style.colorScheme = theme;
  } catch (e) {}
})();
`;
