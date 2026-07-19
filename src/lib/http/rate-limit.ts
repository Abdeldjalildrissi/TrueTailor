interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window in-memory rate limiter. Suitable for the single-instance
 * deployment model documented in DECISIONS.md (D-0007); the interface is
 * deliberately small so a shared-store implementation can replace it if the
 * app is ever scaled horizontally.
 */
export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number
  ) {}

  check(key: string): { allowed: boolean; retryAfterSeconds: number } {
    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      this.sweep(now);
      return { allowed: true, retryAfterSeconds: 0 };
    }

    if (bucket.count < this.limit) {
      bucket.count += 1;
      return { allowed: true, retryAfterSeconds: 0 };
    }

    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
    };
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }

  clear(): void {
    this.buckets.clear();
  }

  private sweep(now: number): void {
    if (this.buckets.size < 10_000) {
      return;
    }
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(key);
      }
    }
  }
}

export const loginIpLimiter = new RateLimiter(10, 15 * 60 * 1000);
export const loginEmailLimiter = new RateLimiter(5, 15 * 60 * 1000);
export const registerIpLimiter = new RateLimiter(5, 60 * 60 * 1000);
// Resume imports invoke the runtime AI — bounded per user to contain cost and abuse.
export const importUserLimiter = new RateLimiter(10, 60 * 60 * 1000);
// Tailoring runs two model calls per request.
export const tailorUserLimiter = new RateLimiter(20, 60 * 60 * 1000);
