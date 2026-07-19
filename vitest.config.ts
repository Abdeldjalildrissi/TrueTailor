import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/live/**", "**/node_modules/**"],
    setupFiles: ["tests/setup.ts"],
    pool: "forks"
  }
});
