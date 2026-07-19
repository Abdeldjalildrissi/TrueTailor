import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_PATH: z.string().min(1).default("./data/app.db"),
  AI_PROVIDER: z.enum(["anthropic", "openai", "google"]).default("anthropic"),
  AI_MODEL: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional()
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
