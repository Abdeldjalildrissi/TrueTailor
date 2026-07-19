import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { env } from "@/lib/env";
import * as schema from "./schema";

export type Db = LibSQLDatabase<typeof schema>;

let dbPromise: Promise<Db> | null = null;

function toUrl(path: string): string {
  if (path === ":memory:") {
    return ":memory:";
  }
  const absolute = isAbsolute(path) ? path : resolve(process.cwd(), path);
  mkdirSync(dirname(absolute), { recursive: true });
  return `file:${absolute}`;
}

async function open(path: string): Promise<Db> {
  const client: Client = createClient({ url: toUrl(path) });
  await client.execute("PRAGMA foreign_keys = ON");
  if (path !== ":memory:") {
    await client.execute("PRAGMA journal_mode = WAL");
  }
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: join(process.cwd(), "drizzle") });
  return db;
}

/**
 * Lazily opened singleton connection; migrations are applied on first open.
 * The promise is cached so concurrent first calls share one migration run.
 */
export function getDb(): Promise<Db> {
  if (!dbPromise) {
    dbPromise = open(env().DATABASE_PATH);
  }
  return dbPromise;
}

/** Test-only: replace the singleton with an isolated database. */
export function setDbForTesting(db: Db | null): void {
  dbPromise = db ? Promise.resolve(db) : null;
}

/** Test-only: open a fresh in-memory database with migrations applied. */
export function openTestDb(): Promise<Db> {
  return open(":memory:");
}
