import { describe, expect, it } from "vitest";
import { burnPasswordCheck, hashPassword, verifyPassword } from "@/lib/auth/password";

describe("password hashing", () => {
  it("verifies a correct password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword(hash, "correct horse battery staple")).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword(hash, "incorrect horse")).toBe(false);
  });

  it("rejects malformed hash strings instead of throwing", async () => {
    expect(await verifyPassword("not-an-argon2-hash", "anything")).toBe(false);
  });

  it("produces unique salted hashes for identical passwords", async () => {
    const a = await hashPassword("same password twice");
    const b = await hashPassword("same password twice");
    expect(a).not.toBe(b);
    expect(a.startsWith("$argon2id$")).toBe(true);
  });

  it("timing equalizer completes without revealing anything", async () => {
    await expect(burnPasswordCheck()).resolves.toBeUndefined();
  });
});
