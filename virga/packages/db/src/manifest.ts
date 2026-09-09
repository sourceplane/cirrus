import type { MigrationManifest } from "./types.js";

// The ordered list of migrations and their checksums. Checksums are generated
// from the files (tooling/migrations/rechecksum.mjs), never typed: the runner
// refuses to apply a migration whose file drifted from what was recorded.

export const manifest: MigrationManifest = {
  version: 1,
  migrations: [
    {
      id: "000_control_baseline",
      context: "control",
      path: "000_control/up.sql",
      checksum:
        "c7f11499fa82d6fd2baa1af7fc75eeb73cd7be252af2e56841509c66001d638b",
      description:
        "Baseline control migration — creates the migration tracking schema",
    },
  ],
};
