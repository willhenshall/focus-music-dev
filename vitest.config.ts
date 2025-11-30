/// <reference types="vitest" />
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",

    // Only run unit tests inside src/
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],

    // Ignore Playwright E2E tests
    exclude: ["tests/**", "node_modules/**"],
  },
});
