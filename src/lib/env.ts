import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_PATH: z.string().min(1).default("./data/app.db"),
  AI_PROVIDER: z.enum(["anthropic", "openai", "google", "openrouter"]).default("anthropic"),
  // `.env` files and shells express "no value" as an empty assignment
  // (`AI_MODEL=`), which arrives as "" — present-but-empty, so a bare
  // `.optional()` does not cover it and `.min(1)` then rejects it. Since this
  // is the only optional variable with a length floor, treat a blank/whitespace
  // value as unset so the documented default model applies. See D-0024.
  AI_MODEL: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().min(1).optional()
  ),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional()
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/** Validated, cached view of process.env. Fails fast on malformed configuration. */
export function env(): Env {
  if (!cached) {
    cached = schema.parse(process.env);
  }
  return cached;
}

/** Test-only: clear the cache so tests can vary environment values. */
export function resetEnvCache(): void {
  cached = null;
}

/** Cookies are marked Secure whenever the app is served over HTTPS. */
export function isSecureOrigin(): boolean {
  return env().APP_URL.startsWith("https://");
}
