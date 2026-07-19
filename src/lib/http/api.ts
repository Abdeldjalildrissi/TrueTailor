import { NextResponse } from "next/server";
import type { z } from "zod";
import { getUserFromRequest } from "@/lib/auth/current-user";
import type { SessionUser } from "@/lib/auth/session";

export function jsonError(
  status: number,
  message: string,
  init?: { headers?: Record<string, string>; details?: unknown }
): NextResponse {
  const body: Record<string, unknown> = { error: message };
  if (init?.details !== undefined) {
    body.details = init.details;
  }
  return NextResponse.json(body, { status, headers: init?.headers });
}

export function rateLimited(retryAfterSeconds: number): NextResponse {
  return jsonError(429, "Too many attempts. Please try again later.", {
    headers: { "Retry-After": String(retryAfterSeconds) }
  });
}

type RequireUserResult =
  { user: SessionUser; response: null } | { user: null; response: NextResponse };

export async function requireUser(req: Request): Promise<RequireUserResult> {
  const user = await getUserFromRequest(req);
  if (!user) {
    return { user: null, response: jsonError(401, "Authentication required.") };
  }
  return { user, response: null };
}

type ParseResult<T> = { data: T; response: null } | { data: null; response: NextResponse };

export async function parseJsonBody<T>(
  req: Request,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>
): Promise<ParseResult<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { data: null, response: jsonError(400, "Request body must be valid JSON.") };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      data: null,
      response: jsonError(400, "Invalid request.", {
        details: parsed.error.flatten().fieldErrors
      })
    };
  }
  return { data: parsed.data, response: null };
}

/** Best-effort client address for rate limiting, honoring reverse-proxy headers. */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0];
    if (first && first.trim()) {
      return first.trim();
    }
  }
  return "unknown";
}
