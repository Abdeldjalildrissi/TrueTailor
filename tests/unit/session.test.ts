import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  createSession,
  destroySession,
  hashToken,
  purgeExpiredSessions,
  validateSessionToken
} from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";

async function insertUser(id = "user-1"): Promise<string> {
  const now = new Date();
  const db = await getDb();
  await db.insert(users).values({
    id,
    email: `${id}@example.com`,
    passwordHash: "irrelevant-for-session-tests",
    displayName: "Test User",
    createdAt: now,
    updatedAt: now
  });
  return id;
}

describe("sessions", () => {
  it("creates and validates a session", async () => {
    const userId = await insertUser();
    const { token } = await createSession(userId);
    const sessionUser = await validateSessionToken(token);
    expect(sessionUser?.id).toBe(userId);
    expect(sessionUser?.email).toBe("user-1@example.com");
  });

  it("stores only the hash of the token, never the token", async () => {
    const userId = await insertUser();
    const { token } = await createSession(userId);
    const db = await getDb();
    const rows = await db.select().from(sessions);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(hashToken(token));
    expect(rows[0]?.id).not.toBe(token);
  });

  it("rejects unknown tokens", async () => {
    expect(await validateSessionToken("completely-unknown-token")).toBeNull();
  });

  it("rejects and deletes expired sessions", async () => {
    const userId = await insertUser();
    const token = "expired-token";
    const db = await getDb();
    await db.insert(sessions).values({
      id: hashToken(token),
      userId,
      createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
      expiresAt: new Date(Date.now() - 1000)
    });

    expect(await validateSessionToken(token)).toBeNull();
    expect(await db.select().from(sessions)).toHaveLength(0);
  });

  it("slides expiration forward when close to expiry", async () => {
    const userId = await insertUser();
    const token = "renewing-token";
    const oldExpiry = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // 5 days out
    const db = await getDb();
    await db.insert(sessions).values({
      id: hashToken(token),
      userId,
      createdAt: new Date(),
      expiresAt: oldExpiry
    });

    expect(await validateSessionToken(token)).not.toBeNull();
    const updated = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, hashToken(token)));
    expect(updated[0]?.expiresAt.getTime()).toBeGreaterThan(oldExpiry.getTime());
  });

  it("destroys sessions", async () => {
    const userId = await insertUser();
    const { token } = await createSession(userId);
    await destroySession(token);
    expect(await validateSessionToken(token)).toBeNull();
  });

  it("cascades session deletion when the user is deleted", async () => {
    const userId = await insertUser();
    await createSession(userId);
    const db = await getDb();
    await db.delete(users).where(eq(users.id, userId));
    expect(await db.select().from(sessions)).toHaveLength(0);
  });
});

describe("session hygiene", () => {
  it("purges expired sessions when new sessions are created", async () => {
    const userId = await insertUser("hygiene-user");
    const db = await getDb();
    await db.insert(sessions).values({
      id: hashToken("stale-token"),
      userId,
      createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
      expiresAt: new Date(Date.now() - 1000)
    });
    await createSession(userId);
    const remaining = await db.select().from(sessions);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).not.toBe(hashToken("stale-token"));
  });

  it("purge is callable directly and idempotent", async () => {
    await purgeExpiredSessions();
    await purgeExpiredSessions();
  });
});
