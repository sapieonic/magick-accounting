import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  esbuild: {
    jsx: "automatic",
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
