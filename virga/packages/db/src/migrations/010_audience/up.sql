-- 010_audience: the people who asked to hear from the site.
-- Context: audience
-- Spec: specs/components/04-data-plane.md, specs/core/domain-model.md
--
-- One row per email address. Subscription is double opt-in: a row is born
-- `pending` with a hashed confirm token; following the link makes it
-- `confirmed`. Unsubscribe links carry a derived token (HMAC of the id), so
-- nothing about unsubscribing is stored here beyond the status.
--
-- Rules:
--   * email is stored lower-cased and is the natural key.
--   * confirm_token_hash is SHA-256 hex of a plaintext that exists only in
--     the confirmation mail; it is cleared on confirm.
--   * tags is a JSON array in TEXT (SQLite has no array type).
--   * Idempotent: IF NOT EXISTS throughout for the D1 runner.

CREATE TABLE IF NOT EXISTS audience_subscribers (
  id                  TEXT PRIMARY KEY,
  email               TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending',
  source              TEXT,
  tags                TEXT NOT NULL DEFAULT '[]',
  confirm_token_hash  TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  confirmed_at        TEXT,
  unsubscribed_at     TEXT,

  CONSTRAINT audience_subscribers_status_check
    CHECK (status IN ('pending', 'confirmed', 'unsubscribed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS audience_subscribers_email_idx
  ON audience_subscribers (email);

CREATE INDEX IF NOT EXISTS audience_subscribers_status_created_idx
  ON audience_subscribers (status, created_at DESC, id DESC);

CREATE UNIQUE INDEX IF NOT EXISTS audience_subscribers_confirm_token_idx
  ON audience_subscribers (confirm_token_hash)
  WHERE confirm_token_hash IS NOT NULL;

-- table audience_subscribers: One row per address. status is the whole lifecycle; tokens are hashed; nothing here identifies a visitor beyond the address they gave.
