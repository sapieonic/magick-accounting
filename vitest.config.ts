import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Resolve the `@/*` alias explicitly here rather than via vite-tsconfig-paths.
// The path plugin only maps files included in tsconfig, but the production
// build excludes test files from tsconfig — so test files would lose alias
// resolution. Defining the alias directly keeps tests independent of that.
const srcDir = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  plugins: [react()],
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@": srcDir,
    },
  },
  test: {
    globals: true,
    projects: [
      {
        // Backend: pure functions, lib helpers, API/business logic.
        // Runs in a Node environment. Test files end in `.test.ts`.
        extends: true,
        test: {
          name: "backend",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        // UI: React components and client hooks.
        // Runs in jsdom with Testing Library. Test files end in `.test.tsx`.
        extends: true,
        test: {
          name: "ui",
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
          setupFiles: ["./vitest.setup.ts"],
        },
      },
    ],
  },
});
