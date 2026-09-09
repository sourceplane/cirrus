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
    {
      id: "010_audience_subscribers",
      context: "audience",
      path: "010_audience/up.sql",
      checksum:
        "a47a80fc1dfb65ef898c4b6af7b48dceca819ca65ae3739db9b1ab251867d818",
      description:
        "Audience — subscribers with double opt-in status and hashed confirm tokens",
    },
    {
      id: "020_forms_submissions",
      context: "forms",
      path: "020_forms/up.sql",
      checksum:
        "64c44423cda7d0cb863a1942139554bb9cb91a7a3656eef01567ffaa2299cf9b",
      description:
        "Forms — bounded visitor submissions with triage status",
    },
    {
      id: "030_engagement_reactions_views",
      context: "engagement",
      path: "030_engagement/up.sql",
      checksum:
        "10b52ecdb38ac61c3e1cc6bf85e7b10fddcc29f8f5d5e73685d3074af2c352ac",
      description:
        "Engagement — reactions, maintained totals, daily view counters",
    },
    {
      id: "040_newsletter_issues_deliveries",
      context: "newsletter",
      path: "040_newsletter/up.sql",
      checksum:
        "4e1e5f62558f253f7a46e27a75c368e53df04552a38fef566467c5934495fec7",
      description:
        "Newsletter — issues and per-subscriber resumable deliveries",
    },
  ],
};
