import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "tests/unit/**/*.test.ts",
      "tests/unit/**/*.test.tsx",
      "tests/integration/**/*.test.ts",
      "lib/**/*.test.ts",
    ],
    coverage: {
      include: ["lib/transforms/**/*.ts"],
      reporter: ["text", "html"],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
      // See tests/stubs/server-only.js — the real package throws outside a
      // "react-server" resolution, which no plain Node test run has.
      "server-only": path.resolve(__dirname, "./tests/stubs/server-only.js"),
    },
  },
});
