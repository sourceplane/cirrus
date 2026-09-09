// Public identifiers — no domain knowledge.
//
// Every record Virga stores is addressed by one id shape everywhere: in the
// database, on the wire, and in the CLI: `<prefix>_<32 hex>` (a UUID v4 with
// the dashes stripped). One representation means there is nothing to decode
// at a boundary and nothing to get wrong; the prefix names the kind so a
// subscriber id can never be mistaken for an issue id in a log line.

// Both Workers and Node ≥ 19 expose the Web Crypto API as a global; this
// package compiles against neither lib, so the one method it uses is declared.
declare const crypto: { randomUUID(): string };

const PUBLIC_ID_RE = /^[a-z]{2,8}_[0-9a-f]{32}$/;

/** Mint a fresh `<prefix>_<32 hex>` id from the platform's CSPRNG. */
export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

/** True when `value` is a well-formed public id (optionally of one kind). */
export function isPublicId(value: unknown, prefix?: string): value is string {
  if (typeof value !== "string" || !PUBLIC_ID_RE.test(value)) return false;
  return prefix === undefined || value.startsWith(`${prefix}_`);
}

/** The kind prefix of a public id, or null when the value is not one. */
export function idPrefix(value: string): string | null {
  return isPublicId(value) ? value.slice(0, value.indexOf("_")) : null;
}

/** The id prefixes this baseline mints, in one place. */
export const ID_PREFIX = {
  subscriber: "sub",
  submission: "frm",
  reaction: "rxn",
  issue: "iss",
  delivery: "dlv",
  request: "req",
} as const;
