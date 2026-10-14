-- 020_forms: what visitors typed into a box and sent.
-- Context: forms
-- Spec: specs/components/04-data-plane.md, specs/core/domain-model.md
--
-- A form is a key the site names (`contact`, `feedback`, `launch-request`);
-- the fields are an opaque, bounded JSON document. The owner reads and
-- triages submissions from the CLI; nothing here is ever rendered publicly.

CREATE TABLE IF NOT EXISTS forms_submissions (
  id          TEXT PRIMARY KEY,
  form        TEXT NOT NULL,
  fields      TEXT NOT NULL DEFAULT '{}',
  status      TEXT NOT NULL DEFAULT 'new',
  visitor     TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  CONSTRAINT forms_submissions_status_check
    CHECK (status IN ('new', 'read', 'archived', 'spam'))
);

CREATE INDEX IF NOT EXISTS forms_submissions_form_created_idx
  ON forms_submissions (form, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS forms_submissions_status_created_idx
  ON forms_submissions (status, created_at DESC, id DESC);

-- table forms_submissions: One row per accepted submission. visitor is a salted daily fingerprint, never an address.
