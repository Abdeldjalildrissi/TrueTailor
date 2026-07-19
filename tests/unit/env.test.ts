import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { env, resetEnvCache } from "@/lib/env";

/**
 * Minimal dotenv reader: mirrors how a `cp .env.example .env` copy is loaded —
 * skip blank lines and comments, split each assignment on its first `=`.
 */
function parseDotenv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      continue;
    }
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

describe("env(): optional variables tolerate the empty-string form", () => {
  afterEach(() => {
    delete process.env.AI_MODEL;
    resetEnvCache();
  });

  it("treats a blank `AI_MODEL=` line as unset rather than a validation error", () => {
    process.env.AI_MODEL = "";
    resetEnvCache();
    expect(env().AI_MODEL).toBeUndefined();
  });

  it("still honors a real AI_MODEL override", () => {
    process.env.AI_MODEL = "claude-sonnet-4-5";
    resetEnvCache();
    expect(env().AI_MODEL).toBe("claude-sonnet-4-5");
  });
});

describe(".env.example is a valid configuration out of the box", () => {
  const saved = { ...process.env };

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in saved)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, saved);
    resetEnvCache();
  });

  it("validates exactly as a fresh `cp .env.example .env` would", () => {
    const example = parseDotenv(readFileSync(join(process.cwd(), ".env.example"), "utf8"));
    Object.assign(process.env, example);
    resetEnvCache();
    expect(() => env()).not.toThrow();
  });
});
