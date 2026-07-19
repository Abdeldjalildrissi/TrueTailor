import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { hashPassword } from "@/lib/auth/password";
import { createSession, SESSION_COOKIE } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { isSecureOrigin } from "@/lib/env";
import { clientIp, jsonError, parseJsonBody, rateLimited } from "@/lib/http/api";
import { registerIpLimiter } from "@/lib/http/rate-limit";

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(10, "Password must be at least 10 characters.").max(200),
  displayName: z.string().trim().min(1).max(100)
});

// Uniform response for any conflict so registration cannot be used to
// enumerate which emails have accounts.
const UNIFORM_CONFLICT = "Unable to create an account with these details.";

export async function POST(req: Request) {
  const limit = registerIpLimiter.check(`register:${clientIp(req)}`);
  if (!limit.allowed) {
    return rateLimited(limit.retryAfterSeconds);
  }

  const { data, response } = await parseJsonBody(req, bodySchema);
  if (!data) {
    return response;
  }

  const localPart = data.email.split("@")[0] ?? "";
  if (localPart.length >= 4 && data.password.toLowerCase().includes(localPart.toLowerCase())) {
    return jsonError(400, "Password must not contain your email address.");
  }

  const db = await getDb();
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, data.email));
  if (existing.length > 0) {
    return jsonError(400, UNIFORM_CONFLICT);
  }

  const now = new Date();
  const user = {
    id: nanoid(),
    email: data.email,
    passwordHash: await hashPassword(data.password),
    displayName: data.displayName,
    createdAt: now,
    updatedAt: now
  };

  try {
    await db.insert(users).values(user);
  } catch {
    // Unique-constraint race between the existence check and the insert.
    return jsonError(400, UNIFORM_CONFLICT);
  }

  const { token, expiresAt } = await createSession(user.id);
  const res = NextResponse.json(
    { user: { id: user.id, email: user.email, displayName: user.displayName } },
    { status: 201 }
  );
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureOrigin(),
    expires: expiresAt,
    path: "/"
  });
  return res;
}
