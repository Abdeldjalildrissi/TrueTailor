import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { profilePhotos } from "@/lib/db/schema";

/**
 * Optional profile photo, one per user. The photo is user-provided identity
 * data (like a profile edit): it is stored and rendered exactly as uploaded,
 * only by export templates that have a photo placement. It never passes
 * through the AI and is never generated.
 */

export const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // 2 MiB

export type PhotoMime = "image/jpeg" | "image/png";

export interface ProfilePhoto {
  mime: PhotoMime;
  bytes: Buffer;
  updatedAt: Date;
}

/** Magic-byte sniffing — the claimed content type is never trusted. */
export function sniffImageMime(bytes: Uint8Array): PhotoMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  return null;
}

export async function getProfilePhoto(userId: string): Promise<ProfilePhoto | null> {
  const db = await getDb();
  const row = (
    await db.select().from(profilePhotos).where(eq(profilePhotos.userId, userId)).limit(1)
  )[0];
  if (!row) {
    return null;
  }
  return { mime: row.mime, bytes: Buffer.from(row.bytes), updatedAt: row.updatedAt };
}

export async function setProfilePhoto(
  userId: string,
  mime: PhotoMime,
  bytes: Buffer
): Promise<void> {
  const db = await getDb();
  const now = new Date();
  await db
    .insert(profilePhotos)
    .values({ userId, mime, bytes, updatedAt: now })
    .onConflictDoUpdate({
      target: profilePhotos.userId,
      set: { mime, bytes, updatedAt: now }
    });
}

export async function deleteProfilePhoto(userId: string): Promise<boolean> {
  const db = await getDb();
  const result = await db.delete(profilePhotos).where(eq(profilePhotos.userId, userId));
  return result.rowsAffected > 0;
}
