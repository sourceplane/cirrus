-- 200_subscriptions_core
-- Subscriptions persistence foundation — recurring charges a person is paying.
-- Bounded context: subscriptions (user-scoped: every row hangs off a user id, never an org)
-- Idempotent: uses IF NOT EXISTS throughout.
-- No cross-context foreign keys: user_id is an opaque identity reference.
-- schema subscriptions: Subscriptions bounded context — the recurring-expense tracker.

CREATE TABLE IF NOT EXISTS subscriptions_items (
  id             TEXT        PRIMARY KEY,
  user_id        TEXT        NOT NULL,
  name           TEXT        NOT NULL,
  amount_cents   INTEGER     NOT NULL,
  currency       TEXT        NOT NULL,
  cadence        TEXT        NOT NULL DEFAULT 'monthly',
  interval_days  INTEGER,
  anchor_date    TEXT        NOT NULL,
  category       TEXT        NOT NULL DEFAULT 'other',
  status         TEXT        NOT NULL DEFAULT 'active',
  url            TEXT,
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  CONSTRAINT subscriptions_amount_check CHECK (amount_cents >= 0),
  CONSTRAINT subscriptions_cadence_check CHECK (cadence IN ('weekly', 'monthly', 'yearly', 'custom')),
  CONSTRAINT subscriptions_status_check CHECK (status IN ('active', 'paused', 'cancelled')),
  -- `IS NOT NULL` is load-bearing: SQLite accepts a CHECK that evaluates to
  -- NULL, so `NULL > 0` alone would let a custom-cadence row exist with no
  -- interval — and nothing could then compute its next renewal.
  CONSTRAINT subscriptions_interval_check CHECK (
    (cadence = 'custom' AND interval_days IS NOT NULL AND interval_days > 0)
    OR (cadence <> 'custom' AND interval_days IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS subscriptions_items_user_status_idx
  ON subscriptions_items (user_id, status, name ASC);

CREATE INDEX IF NOT EXISTS subscriptions_items_user_created_idx
  ON subscriptions_items (user_id, created_at DESC, id DESC);

-- table subscriptions_items: One recurring charge, owned by one person.
-- column subscriptions_items.amount_cents: Minor units of `currency`, never a float.
-- column subscriptions_items.cadence: weekly, monthly, yearly, or custom (every interval_days).
-- column subscriptions_items.anchor_date: A known billing date, 'YYYY-MM-DD'. Every future
--   renewal is derived from it, so the row stores no computed "next" date to drift.
-- column subscriptions_items.status: active (counted), paused (kept, not counted), cancelled (history).
