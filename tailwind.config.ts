import type { Config } from "tailwindcss";

/** `rgb(var(--x) / <alpha-value>)` so every token supports `/alpha` modifiers. */
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Ledger tokens (see globals.css and docs/design/ledger.md).
        background: v("bg"),
        surface: v("surface"),
        sunk: v("sunk"),
        ink: {
          DEFAULT: v("ink"),
          2: v("ink-2"),
          3: v("ink-3"),
        },
        rule: {
          DEFAULT: v("rule"),
          2: v("rule-2"),
        },
        hover: v("hover"),
        bar: v("bar"),
        rail: {
          DEFAULT: v("rail"),
          hover: "#29276A",
          active: "#34327F",
          line: "#3A3888",
          ink: "#D6D8F5",
          muted: "#A9ACE0",
          icon: "#C5CBFF",
          mark: "#9BA5F8",
        },
        pocket: v("pocket"),
        // `amber` keeps Tailwind's default 50–950 scale (deep-merged);
        // DEFAULT and `soft` are the Ledger pocket/owed tokens.
        amber: {
          DEFAULT: v("amber"),
          soft: v("amber-soft"),
        },
        success: {
          DEFAULT: v("success"),
          soft: v("success-soft"),
        },
        danger: {
          DEFAULT: v("danger"),
          soft: v("danger-soft"),
        },
        accent: {
          DEFAULT: v("accent"),
          ink: v("accent-ink"),
          hover: v("accent-hover"),
          2: v("accent-2"),
          soft: v("accent-soft"),
          line: v("accent-line"),
          // Legacy numeric shades (were teal) now follow the indigo brand.
          50: "#f8f9ff",
          100: "#eff1fe",
          200: "#e0e4fd",
          300: "#c1c9fb",
          400: "#9ba5f8",
          500: "#7b83f5",
          600: "#5c5fed",
          700: "#4b49d1",
          800: "#3e3ba8",
          900: "#35328b",
        },
        tint: {
          DEFAULT: "var(--tint)",
          2: "var(--tint-2)",
        },
        cat: {
          sw: v("c-sw"),
          "sw-soft": v("c-sw-s"),
          co: v("c-co"),
          "co-soft": v("c-co-s"),
          tr: v("c-tr"),
          "tr-soft": v("c-tr-s"),
          ed: v("c-ed"),
          "ed-soft": v("c-ed-s"),
          me: v("c-me"),
          "me-soft": v("c-me-s"),
          of: v("c-of"),
          "of-soft": v("c-of-s"),
          mk: v("c-mk"),
          "mk-soft": v("c-mk-s"),
        },

        // Legacy names, remapped to Ledger values in globals.css.
        "surface-elevated": v("surface-elevated"),
        "surface-muted": v("surface-muted"),
        foreground: v("foreground"),
        muted: {
          DEFAULT: v("muted"),
          foreground: v("muted-foreground"),
        },
        subtle: v("subtle"),
        "subtle-hover": v("subtle-hover"),
        line: v("line"),
        "line-strong": v("line-strong"),
        brand: {
          50: "#f8f9ff",
          100: "#eff1fe",
          200: "#e0e4fd",
          300: "#c1c9fb",
          400: "#9ba5f8",
          500: "#7b83f5",
          600: "#5c5fed",
          700: "#4b49d1",
          800: "#3e3ba8",
          900: "#35328b",
          950: "#1f1d53",
        },
      },
      fontFamily: {
        sans: ["Geist", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        // Old classes alias Geist so nothing pulls a serif.
        heading: ["Geist", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        display: ["Geist", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["Geist Mono", "ui-monospace", "Menlo", "Consolas", "monospace"],
      },
      borderRadius: {
        // Ledger: 6px controls, 8px panels.
        control: "6px",
        panel: "8px",
      },
      transitionDuration: {
        140: "140ms",
      },
      boxShadow: {
        // Rules, not shadows: only floating layers (menus, dialogs) and the
        // mobile Add button get one.
        elevated: "0 12px 32px -12px rgb(19 19 31 / 0.25)",
        fab: "0 6px 14px -6px rgb(var(--accent))",
      },
    },
  },
  plugins: [],
};
export default config;
