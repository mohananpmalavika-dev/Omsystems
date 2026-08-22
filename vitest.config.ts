import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 20000,
    hookTimeout: 20000,
    exclude: [
      "**/node_modules/**",
      "**/.git/**",
      "**/dist/**",
      "dashboard/e2e/**",
    ],
  },
});
