// The bounded contexts of the site's data plane. Each is a table-name prefix
// (`audience_subscribers`, `forms_submissions`, …) on the one D1 database —
// SQLite has no schemas, so the repositories are where the boundary lives.

export const BOUNDED_CONTEXTS = [
  "control",
  "audience",
  "forms",
  "engagement",
  "newsletter",
] as const;

export type BoundedContext = (typeof BOUNDED_CONTEXTS)[number];

export interface MigrationEntry {
  id: string;
  context: BoundedContext;
  path: string;
  checksum: string;
  description: string;
}

export interface MigrationManifest {
  version: 1;
  migrations: MigrationEntry[];
}
