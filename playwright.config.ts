import { defineConfig, devices } from "@playwright/test";

const PORT = 3210;

/**
 * End-to-end + accessibility harness. Runs against the production build
 * (`next start`) with a throwaway SQLite database. Locally, run the browsers
 * you have installed (e.g. `--project=chromium`); CI installs and runs the
 * full chromium/firefox/webkit matrix.
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure"
  },
  webServer: {
    command: `npm run start -- --port ${PORT} --hostname 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}/api/healthz`,
    reuseExistingServer: false,
    timeout: 90_000,
    env: {
      NODE_ENV: "production",
      DATABASE_PATH: "./data/e2e.db",
      APP_URL: `http://127.0.0.1:${PORT}`,
      // The e2e suite must behave like a clean deployment: no provider keys
      // leak in from the host environment.
      AI_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "",
      OPENAI_API_KEY: "",
      GEMINI_API_KEY: ""
    }
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } }
  ]
});
