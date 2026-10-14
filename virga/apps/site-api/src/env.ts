export interface Env {
  /** The site database (Cloudflare D1). */
  SITE_DB?: D1Database;
  /** Rate-limit token buckets and per-address mail throttles. */
  RATE_LIMIT_KV?: KVNamespace;
  /** Service binding to mail-worker (internal). */
  MAIL_WORKER?: Fetcher;

  ENVIRONMENT: string;
  /** Display name, used in mail and health. */
  SITE_NAME?: string;
  /** Canonical site origin, for confirm/unsubscribe redirects. */
  SITE_URL?: string;
  /** Comma-separated origins allowed to call this API from a browser. */
  SITE_ORIGINS?: string;
  /** Where form receipts go; unset = no receipts. */
  OWNER_EMAIL?: string;

  // Secrets
  /** Bearer token for /v1/owner/*. Unset = owner routes answer 503. */
  OWNER_TOKEN?: string;
  /** HMAC key for derived unsubscribe tokens (shared with mail-worker). */
  TOKEN_SECRET?: string;
  /** Salt for daily visitor fingerprints. */
  FINGERPRINT_SALT?: string;
  /** Cloudflare Turnstile secret; when set, subscribe and forms require a token. */
  TURNSTILE_SECRET?: string;
}
