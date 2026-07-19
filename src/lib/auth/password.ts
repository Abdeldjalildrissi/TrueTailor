import { hash, verify } from "@node-rs/argon2";

// OWASP-recommended argon2id parameters: 19 MiB memory, 2 iterations, parallelism 1.
const ARGON2_PARAMS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1
};

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_PARAMS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password, ARGON2_PARAMS);
  } catch {
    // Malformed hash strings verify as false rather than throwing.
    return false;
  }
}

// Performs the same amount of hashing work as a real credential check so that
// login timing does not reveal whether an account exists.
let equalizerHash: string | null = null;

export async function burnPasswordCheck(): Promise<void> {
  if (!equalizerHash) {
    equalizerHash = await hash("truetailor-timing-equalizer", ARGON2_PARAMS);
  }
  try {
    await verify(equalizerHash, "never-the-real-password", ARGON2_PARAMS);
  } catch {
    // Outcome is intentionally discarded.
  }
}
