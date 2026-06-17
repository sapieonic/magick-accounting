import type { Config } from "tailwindcss";

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
        background: "rgb(var(--background) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        "surface-elevated": "rgb(var(--surface-elevated) / <alpha-value>)",
        "surface-muted": "rgb(var(--surface-muted) / <alpha-value>)",
        foreground: "rgb(var(--foreground) / <alpha-value>)",
        muted: {
          DEFAULT: "rgb(var(--muted) / <alpha-value>)",
          foreground: "rgb(var(--muted-foreground) / <alpha-value>)",
        },
        subtle: "rgb(var(--subtle) / <alpha-value>)",
        "subtle-hover": "rgb(var(--subtle-hover) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        "line-strong": "rgb(var(--line-strong) / <alpha-value>)",
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
        accent: {
          50: "#f0fdfa",
          100: "#ccfbf1",
          200: "#99f6e4",
          300: "#5eead4",
          400: "#2dd4bf",
          500: "#14b8a6",
          600: "#0d9488",
          700: "#0f766e",
          800: "#115e59",
          900: "#134e4a",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
        heading: [
          "Plus Jakarta Sans",
          "Inter",
          "sans-serif",
        ],
      },
      boxShadow: {
        soft: "0 2px 4px rgba(0,0,0,0.02), 0 10px 20px rgba(0,0,0,0.03)",
        elevated: "0 20px 40px rgba(0,0,0,0.04), 0 5px 10px rgba(0,0,0,0.02)",
      },
    },
  },
  plugins: [],
};
export default config;
