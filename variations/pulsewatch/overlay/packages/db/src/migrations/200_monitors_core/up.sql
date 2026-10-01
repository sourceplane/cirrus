-- 200_monitors_core
-- Monitors persistence foundation — HTTP monitors, their checks, the incidents
-- those checks open, and the owner's public status page.
-- Bounded context: monitors (user-scoped: every row hangs off a user id, never an org)
-- Idempotent: uses IF NOT EXISTS throughout.
-- No cross-context foreign keys: user_id is an opaque identity reference.
-- schema monitors: Monitors bounded context — uptime monitoring and status pages.

-- ============================================================
-- Monitors: what to check, how often, and what "up" means.
-- ============================================================

CREATE TABLE IF NOT EXISTS monitors_monitors (
  id                    TEXT        PRIMARY KEY,
  user_id               TEXT        NOT NULL,
  name                  TEXT        NOT NULL,
  url                   TEXT        NOT NULL,
  method                TEXT        NOT NULL DEFAULT 'GET',
  interval_sec          INTEGER     NOT NULL DEFAULT 300,
  expected_status       INTEGER     NOT NULL DEFAULT 200,
  enabled               INTEGER     NOT NULL DEFAULT 1,
  last_checked_at       TEXT,
  last_status           TEXT        NOT NULL DEFAULT 'unknown',
  consecutive_failures  INTEGER     NOT NULL DEFAULT 0,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  CONSTRAINT monitors_method_check CHECK (method IN ('GET', 'HEAD')),
  CONSTRAINT monitors_interval_check CHECK (interval_sec IN (60, 300, 900, 1800, 3600)),
  CONSTRAINT monitors_status_check CHECK (last_status IN ('up', 'down', 'unknown')),
  CONSTRAINT monitors_expected_status_check CHECK (expected_status BETWEEN 100 AND 599)
);

CREATE INDEX IF NOT EXISTS monitors_monitors_user_created_idx
  ON monitors_monitors (user_id, created_at DESC, id DESC);

-- The scheduler's own index: due monitors are enabled ones checked longest ago.
CREATE INDEX IF NOT EXISTS monitors_monitors_due_idx
  ON monitors_monitors (enabled, last_checked_at ASC);

-- table monitors_monitors: One HTTP endpoint being watched, owned by one person.
-- column monitors_monitors.last_status: The current verdict; 'unknown' until the first check.
-- column monitors_monitors.consecutive_failures: Drives the incident state machine —
--   one failure is a blip, two in a row opens an incident.

-- ============================================================
-- Checks: the result of one probe. Append-only.
-- ============================================================

CREATE TABLE IF NOT EXISTS monitors_checks (
  id          TEXT        PRIMARY KEY,
  monitor_id  TEXT        NOT NULL REFERENCES monitors_monitors(id),
  user_id     TEXT        NOT NULL,
  checked_at  TEXT        NOT NULL,
  ok          INTEGER     NOT NULL,
  status_code INTEGER,
  latency_ms  INTEGER,
  error       TEXT
);

CREATE INDEX IF NOT EXISTS monitors_checks_monitor_time_idx
  ON monitors_checks (monitor_id, checked_at DESC);

-- table monitors_checks: One probe result; uptime and latency are computed from these.
-- column monitors_checks.error: Transport-level failure text, truncated by the worker.

-- ============================================================
-- Incidents: a period of being down, opened and resolved by checks.
-- ============================================================

CREATE TABLE IF NOT EXISTS monitors_incidents (
  id          TEXT        PRIMARY KEY,
  monitor_id  TEXT        NOT NULL REFERENCES monitors_monitors(id),
  user_id     TEXT        NOT NULL,
  opened_at   TEXT        NOT NULL,
  resolved_at TEXT,
  cause       TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS monitors_incidents_user_opened_idx
  ON monitors_incidents (user_id, opened_at DESC);

-- Finding the open incident for a monitor is the hot path of every check.
CREATE INDEX IF NOT EXISTS monitors_incidents_open_idx
  ON monitors_incidents (monitor_id, resolved_at);

-- table monitors_incidents: An outage window; `resolved_at IS NULL` means ongoing.

-- ============================================================
-- Status page: one per user, addressed publicly by its handle.
-- ============================================================

CREATE TABLE IF NOT EXISTS monitors_status_pages (
  user_id      TEXT        PRIMARY KEY,
  handle       TEXT        NOT NULL,
  title        TEXT        NOT NULL,
  description  TEXT,
  public       INTEGER     NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS monitors_status_pages_handle_idx
  ON monitors_status_pages (handle);

-- table monitors_status_pages: The owner's public status page settings.
-- column monitors_status_pages.public: 0/1; a private page 404s to visitors.
