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
        // Boundary of form controls (inputs, selects, chips): >= 3:1 against the surface.
        "control-line": v("control-line"),
        overlay: v("overlay"),
        hover: v("hover"),
        bar: v("bar"),
        rail: {
          DEFAULT: v("rail"),
          active: v("rail-active"),
          line: v("rail-line"),
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
          soft: v("accent-soft"),
          line: v("accent-line"),
        },
        tint: {
          DEFAULT: "var(--tint)",
          2: "var(--tint-2)",
        },
      },
      fontFamily: {
        sans: ["Geist", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["Geist Mono", "ui-monospace", "Menlo", "Consolas", "monospace"],
      },
      borderRadius: {
        // Ledger: 8px controls, 12px panels (inner = outer - padding).
        control: "8px",
        panel: "12px",
      },
      // One curve and one short duration for every transition-* utility, so
      // call sites never repeat them (`ease-out` and `duration-140` are aliases).
      transitionDuration: {
        DEFAULT: "140ms",
        140: "140ms",
      },
      transitionTimingFunction: {
        DEFAULT: "cubic-bezier(0.22, 1, 0.36, 1)",
        out: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      boxShadow: {
        // Rules, not shadows: only floating layers (menus, dialogs) and the
        // mobile Add button get one.
        elevated: "0 1px 2px rgb(23 23 22 / 0.04), 0 12px 32px -12px rgb(23 23 22 / 0.18)",
        fab: "0 6px 16px -6px rgb(23 23 22 / 0.35)",
        // The active rail row in light: a white step lifted by a hairline shadow.
        lift: "0 1px 2px rgb(23 23 22 / 0.06), 0 0 0 1px rgb(23 23 22 / 0.06)",
      },
    },
  },
  plugins: [],
};
export default config;
