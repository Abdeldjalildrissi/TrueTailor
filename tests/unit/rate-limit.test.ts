import { afterEach, describe, expect, it, vi } from "vitest";
import { RateLimiter } from "@/lib/http/rate-limit";

describe("RateLimiter", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests up to the limit and blocks the next one", () => {
    const limiter = new RateLimiter(3, 60_000);
    expect(limiter.check("k").allowed).toBe(true);
    expect(limiter.check("k").allowed).toBe(true);
    expect(limiter.check("k").allowed).toBe(true);
    const fourth = limiter.check("k");
    expect(fourth.allowed).toBe(false);
    expect(fourth.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("tracks keys independently", () => {
    const limiter = new RateLimiter(1, 60_000);
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("b").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
  });

  it("resets after the window elapses", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-19T00:00:00Z"));
    const limiter = new RateLimiter(1, 1000);
    expect(limiter.check("k").allowed).toBe(true);
    expect(limiter.check("k").allowed).toBe(false);
    vi.setSystemTime(new Date("2026-07-19T00:00:01.001Z"));
    expect(limiter.check("k").allowed).toBe(true);
  });

  it("clears a single key on demand", () => {
    const limiter = new RateLimiter(1, 60_000);
    expect(limiter.check("k").allowed).toBe(true);
    expect(limiter.check("k").allowed).toBe(false);
    limiter.reset("k");
    expect(limiter.check("k").allowed).toBe(true);
  });
});
