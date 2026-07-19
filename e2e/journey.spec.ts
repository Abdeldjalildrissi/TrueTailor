import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * End-to-end journey + WCAG 2.2 AA accessibility audit, run against the
 * production build under the nonce-based CSP. Every key page is scanned with
 * axe-core using the WCAG 2.0/2.1/2.2 A+AA rule tags; any violation fails
 * the suite with the full violation report in the assertion message.
 */

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(
    results.violations,
    `axe violations on ${page.url()}:\n${JSON.stringify(results.violations, null, 2)}`
  ).toEqual([]);
}

test.describe.configure({ mode: "serial" });

const email = `e2e-${Date.now()}@example.com`;
const password = "keyboard reachable flows";

test("landing page renders under strict CSP and passes the WCAG audit", async ({ page }) => {
  const cspErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes("Content Security Policy")) {
      cspErrors.push(message.text());
    }
  });

  const response = await page.goto("/");
  expect(response?.status()).toBe(200);

  const csp = response?.headers()["content-security-policy"] ?? "";
  expect(csp).toContain("script-src 'self' 'nonce-");
  expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");

  // Hydration proof: interactive content works, so nonced scripts executed.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(cspErrors).toEqual([]);

  await expectAccessible(page);
});

test("skip link is the first focusable element", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
});

test("login page passes the WCAG audit", async ({ page }) => {
  await page.goto("/login");
  await expectAccessible(page);
});

test("register page passes the WCAG audit and signup works end to end", async ({ page }) => {
  await page.goto("/register");
  await expectAccessible(page);

  await page.getByLabel("Full name").fill("E2E Tester");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  await page.waitForURL("**/app");
  await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible();
  await expectAccessible(page);
});

test("authenticated workspace pages pass the WCAG audit", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/app");

  await page.goto("/app/resume");
  await expect(page.getByRole("heading", { name: "Master resume" })).toBeVisible();
  await expectAccessible(page);

  await page.goto("/app/tailor");
  await expect(page.getByRole("heading", { name: "Tailor your resume" })).toBeVisible();
  await expectAccessible(page);
});

test("import error path surfaces an accessible alert when no AI provider is configured", async ({
  page
}) => {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/app");

  await page.goto("/app/resume");
  await page
    .getByLabel("Or paste resume text")
    .fill(
      "Jane Smith\nSenior Engineer at Acme Corp since 2019.\n- Built the billing platform for 2 million users across three regions"
    );
  await page.getByRole("button", { name: "Import pasted text" }).click();

  // Next.js's route announcer also carries role="alert" — scope to ours.
  const alert = page.getByRole("alert").filter({ hasText: /not configured/ });
  await expect(alert).toBeVisible({ timeout: 15_000 });
  await expectAccessible(page);
});

test("unauthenticated visitors are redirected away from the workspace", async ({ page }) => {
  await page.goto("/app/resume");
  await page.waitForURL("**/login?from=%2Fapp%2Fresume");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});

test("session survives reload and sign-out returns to the landing page", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/app");

  await page.reload();
  await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/$/);
  await expect(page.getByRole("link", { name: "Create account" })).toBeVisible();
});
