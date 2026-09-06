import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  resolve: {
    alias: {
      "@sentinel/contracts": resolve(__dirname, "./packages/contracts/src/index.ts"),
    },
  },
  test: {
    globals: true,
    setupFiles: [resolve(__dirname, "./test/setup.ts")],
    testTimeout: 20000,
    hookTimeout: 20000,
    exclude: [
      "**/node_modules/**",
      "**/.git/**",
      "**/dist/**",
      "Omsystems/**",
      "dashboard/e2e/**",
      "tests/**",
      "test/ai/local-ai-pipeline.test.ts",
    ],
  },
});


