import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createSqlExecutor } from "@site/db/d1";
import { testDatabase } from "@site/testing/sqlite";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_ROOT = resolve(__dirname, "../../..", "packages/db/src/migrations");

/** A fresh migrated database and the executor the repositories talk to. */
export function executorOverFreshDatabase() {
  const { db, binding } = testDatabase(MIGRATIONS_ROOT);
  return { db, executor: createSqlExecutor(binding) };
}

export const T0 = "2026-01-02T03:04:05.000Z";
export const T1 = "2026-01-02T03:05:05.000Z";
export const T2 = "2026-01-02T03:06:05.000Z";
