// A D1 binding over a real SQLite engine, for tests.
//
// D1 is SQLite. Every repository suite in this workspace runs its SQL through
// `node:sqlite` rather than asserting on statement text, so a statement the
// tests accept is a statement D1 runs. The migrations are applied from the
// files on disk in manifest order using the runner's own statement splitter —
// the production path, not a copy of it.

import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { D1Binding } from "@site/db/d1";
import { D1ApiAdapter } from "@site/db/runner";

/** Wrap an open SQLite database as the `D1Binding` the executor expects. */
export function d1Over(db: DatabaseSync): D1Binding {
  return {
    prepare(query: string) {
      let bound: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) {
          bound = values;
          return statement;
        },
        all<T>() {
          const prepared = db.prepare(query);
          const rows = prepared.all(...(bound as never[])) as T[];
          return Promise.resolve({ results: rows, success: true });
        },
      };
      return statement;
    },
  } as unknown as D1Binding;
}

/** The migration directories under `migrationsRoot`, in apply order. */
export function migrationDirs(migrationsRoot: string): string[] {
  return readdirSync(migrationsRoot)
    .filter((d) => existsSync(join(migrationsRoot, d, "up.sql")))
    .sort();
}

/** Apply every migration under `migrationsRoot` to `db`. */
export function applyMigrations(db: DatabaseSync, migrationsRoot: string): void {
  for (const dir of migrationDirs(migrationsRoot)) {
    const sql = readFileSync(join(migrationsRoot, dir, "up.sql"), "utf8");
    for (const statement of D1ApiAdapter.splitStatements(sql)) db.exec(statement);
  }
}

/** A fresh in-memory database with foreign keys on and every migration applied. */
export function migratedDatabase(migrationsRoot: string): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  applyMigrations(db, migrationsRoot);
  return db;
}

/** A migrated database and a D1 binding over it, in one call. */
export function testDatabase(migrationsRoot: string): { db: DatabaseSync; binding: D1Binding } {
  const db = migratedDatabase(migrationsRoot);
  return { db, binding: d1Over(db) };
}
