-- 040_newsletter: what the owner sends.
-- Context: newsletter
-- Spec: specs/components/04-data-plane.md, specs/core/domain-model.md
--
-- An issue is authored by the owner (CLI or repo) and sent once. Deliveries
-- are the receipt: one row per confirmed subscriber at send time, unique
-- per (issue, subscriber), so a broadcast that stops part-way resumes from
-- the rows still `queued` and nothing is sent twice.

CREATE TABLE IF NOT EXISTS newsletter_issues (
  id          TEXT PRIMARY KEY,
  slug        TEXT NOT NULL,
  subject     TEXT NOT NULL,
  html        TEXT NOT NULL,
  text        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'draft',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  sent_at     TEXT,

  CONSTRAINT newsletter_issues_status_check
    CHECK (status IN ('draft', 'sending', 'sent'))
);

CREATE UNIQUE INDEX IF NOT EXISTS newsletter_issues_slug_idx
  ON newsletter_issues (slug);

CREATE INDEX IF NOT EXISTS newsletter_issues_created_idx
  ON newsletter_issues (created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS newsletter_deliveries (
  id                  TEXT PRIMARY KEY,
  issue_id            TEXT NOT NULL REFERENCES newsletter_issues (id),
  subscriber_id       TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'queued',
  provider_message_id TEXT,
  error               TEXT,
  attempted_at        TEXT,

  CONSTRAINT newsletter_deliveries_status_check
    CHECK (status IN ('queued', 'sent', 'failed', 'skipped'))
);

CREATE UNIQUE INDEX IF NOT EXISTS newsletter_deliveries_issue_subscriber_idx
  ON newsletter_deliveries (issue_id, subscriber_id);

CREATE INDEX IF NOT EXISTS newsletter_deliveries_issue_status_idx
  ON newsletter_deliveries (issue_id, status);

-- table newsletter_issues: One row per issue; html/text are the rendered body the broadcast wraps with the per-recipient footer.
-- table newsletter_deliveries: One row per (issue, subscriber). error is bounded and scrubbed; provider_message_id is an opaque reference.
