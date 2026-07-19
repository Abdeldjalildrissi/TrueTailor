import { cookies } from "next/headers";
import { SESSION_COOKIE, validateSessionToken, type SessionUser } from "./session";

/** Session lookup for Server Components and layouts (reads the Next cookie store). */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }
  return validateSessionToken(token);
}

/**
 * Session lookup for Route Handlers. Parses the Cookie header from the raw
 * Request so handlers stay plain functions of Request — directly testable.
 */
export async function getUserFromRequest(req: Request): Promise<SessionUser | null> {
  const token = readCookie(req.headers.get("cookie"), SESSION_COOKIE);
  if (!token) {
    return null;
  }
  return validateSessionToken(token);
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) {
    return null;
  }
  for (const part of header.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName === name) {
      return rest.join("=") || null;
    }
  }
  return null;
}
