import { createHash, randomBytes } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";

export const SESSION_COOKIE = "tt_session";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const RENEWAL_WINDOW_MS = 15 * 24 * 60 * 60 * 1000; // extend when under 15 days remain

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  createdAt: Date;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Opportunistic hygiene: drop expired sessions whenever a new one is minted. */
export async function purgeExpiredSessions(): Promise<void> {
  const db = await getDb();
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  await purgeExpiredSessions();
  const token = generateSessionToken();
  const now = Date.now();
  const expiresAt = new Date(now + SESSION_TTL_MS);
  const db = await getDb();
  await db.insert(sessions).values({
    id: hashToken(token),
    userId,
    createdAt: new Date(now),
    expiresAt
  });
  return { token, expiresAt };
}

export async function validateSessionToken(token: string): Promise<SessionUser | null> {
  const db = await getDb();
  const id = hashToken(token);
  const rows = await db
    .select({
      expiresAt: sessions.expiresAt,
      userId: users.id,
      email: users.email,
      displayName: users.displayName,
      userCreatedAt: users.createdAt
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, id));

  const row = rows[0];
  if (!row) {
    return null;
  }

  const now = Date.now();
  if (row.expiresAt.getTime() <= now) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }

  // Sliding expiration: refresh the window as it approaches expiry.
  if (row.expiresAt.getTime() - now < RENEWAL_WINDOW_MS) {
    await db
      .update(sessions)
      .set({ expiresAt: new Date(now + SESSION_TTL_MS) })
      .where(eq(sessions.id, id));
  }

  return {
    id: row.userId,
    email: row.email,
    displayName: row.displayName,
    createdAt: row.userCreatedAt
  };
}

export async function destroySession(token: string): Promise<void> {
  const db = await getDb();
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}
