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
          50: "#f3f8f4",
          100: "#e0eee3",
          200: "#c2dec9",
          300: "#97c6a4",
          400: "#65a878",
          500: "#418a57",
          600: "#2f7045",
          700: "#265a39",
          800: "#20482f",
          900: "#1b3c28",
          950: "#0d2115",
        },
        accent: {
          50: "#fdf8ed",
          100: "#f9edcd",
          200: "#f2d997",
          300: "#eac261",
          400: "#e4ad3c",
          500: "#dc9626",
          600: "#c2761e",
          700: "#a2571c",
          800: "#84451d",
          900: "#6d391b",
        },
      },
      fontFamily: {
        sans: [
          "Hanken Grotesk",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
        display: ["Fraunces", "Georgia", "serif"],
        mono: ["Spline Sans Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
