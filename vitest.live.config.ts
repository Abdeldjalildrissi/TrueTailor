import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Live-provider verification suite. Excluded from the default test run and
 * from CI: it requires a real provider API key in the environment and makes
 * real model calls. Run explicitly, e.g.:
 *   AI_PROVIDER=google GEMINI_API_KEY=... npx vitest run --config vitest.live.config.ts
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  test: {
    environment: "node",
    include: ["tests/live/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    pool: "forks",
    testTimeout: 300_000,
    hookTimeout: 60_000
  }
});
