import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { burnPasswordCheck, verifyPassword } from "@/lib/auth/password";
import { createSession, SESSION_COOKIE } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { isSecureOrigin } from "@/lib/env";
import { clientIp, jsonError, parseJsonBody, rateLimited } from "@/lib/http/api";
import { loginEmailLimiter, loginIpLimiter } from "@/lib/http/rate-limit";

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(200)
});

const INVALID_CREDENTIALS = "Invalid email or password.";

export async function POST(req: Request) {
  const ipLimit = loginIpLimiter.check(`login:${clientIp(req)}`);
  if (!ipLimit.allowed) {
    return rateLimited(ipLimit.retryAfterSeconds);
  }

  const { data, response } = await parseJsonBody(req, bodySchema);
  if (!data) {
    return response;
  }

  const emailLimit = loginEmailLimiter.check(`login:${data.email}`);
  if (!emailLimit.allowed) {
    return rateLimited(emailLimit.retryAfterSeconds);
  }

  const db = await getDb();
  const rows = await db.select().from(users).where(eq(users.email, data.email));
  const user = rows[0];

  if (!user) {
    // Same hashing cost as a real check — no timing oracle for account existence.
    await burnPasswordCheck();
    return jsonError(400, INVALID_CREDENTIALS);
  }

  const valid = await verifyPassword(user.passwordHash, data.password);
  if (!valid) {
    return jsonError(400, INVALID_CREDENTIALS);
  }

  loginEmailLimiter.reset(`login:${data.email}`);

  const { token, expiresAt } = await createSession(user.id);
  const res = NextResponse.json({
    user: { id: user.id, email: user.email, displayName: user.displayName }
  });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureOrigin(),
    expires: expiresAt,
    path: "/"
  });
  return res;
}
