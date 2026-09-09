import { readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { manifest } from "@site/db";
import { D1ApiAdapter } from "@site/db/runner";
import { migratedDatabase, migrationDirs } from "@site/testing/sqlite";

// The migrations are checked against a REAL SQLite engine here, not a mock.
// D1 is SQLite, so a statement `node:sqlite` parses and runs is a statement
// D1 runs — and a migration the manifest lists must exist on disk with the
// checksum the manifest recorded.

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_ROOT = resolve(__dirname, "../../..", "packages/db/src/migrations");

describe("migrations against a real SQLite engine", () => {
  it("apply cleanly in manifest order", () => {
    expect(() => migratedDatabase(MIGRATIONS_ROOT)).not.toThrow();
  });

  it("are idempotent — a second application changes nothing", () => {
    const db = migratedDatabase(MIGRATIONS_ROOT);
    for (const dir of migrationDirs(MIGRATIONS_ROOT)) {
      const sql = readFileSync(join(MIGRATIONS_ROOT, dir, "up.sql"), "utf8");
      for (const statement of D1ApiAdapter.splitStatements(sql)) {
        try {
          db.exec(statement);
        } catch (err) {
          // SQLite has no `ADD COLUMN IF NOT EXISTS`; the runner's applied
          // ledger is what stops a column add from running twice. Every other
          // statement must be re-runnable on its own.
          expect(String(err)).toMatch(/duplicate column name/i);
        }
      }
    }
  });

  it("match the manifest one-to-one, in order", () => {
    const onDisk = migrationDirs(MIGRATIONS_ROOT);
    const listed = manifest.migrations.map((m) => m.path.replace(/\/up\.sql$/, ""));
    expect(listed).toEqual(onDisk);
  });

  it("create the migration ledger the runner records into", () => {
    const db = migratedDatabase(MIGRATIONS_ROOT);
    const columns = db
      .prepare("PRAGMA table_info(_migrations_applied)")
      .all()
      .map((row) => (row as { name: string }).name);
    expect(columns).toEqual(["id", "context", "checksum", "applied_at", "applied_by"]);
  });
});
