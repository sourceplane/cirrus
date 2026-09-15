-- 030_engagement: reactions and views on any slug.
-- Context: engagement
-- Spec: specs/components/04-data-plane.md, specs/core/domain-model.md
--
-- A slug is whatever the site addresses (`launches/acme`, `posts/hello`).
-- Reactions are toggles keyed on a salted daily visitor fingerprint; the
-- totals table is maintained by the repository in the same statement list
-- as the toggle so rankings never scan the reaction rows. Views are daily
-- counters — no row per visit, no visitor column.

CREATE TABLE IF NOT EXISTS engagement_reactions (
  id          TEXT PRIMARY KEY,
  slug        TEXT NOT NULL,
  kind        TEXT NOT NULL,
  visitor     TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  CONSTRAINT engagement_reactions_kind_check
    CHECK (kind IN ('upvote', 'like'))
);

CREATE UNIQUE INDEX IF NOT EXISTS engagement_reactions_slug_kind_visitor_idx
  ON engagement_reactions (slug, kind, visitor);

CREATE INDEX IF NOT EXISTS engagement_reactions_slug_created_idx
  ON engagement_reactions (slug, kind, created_at);

CREATE TABLE IF NOT EXISTS engagement_reaction_totals (
  slug        TEXT NOT NULL,
  kind        TEXT NOT NULL,
  count       INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  PRIMARY KEY (slug, kind),
  CONSTRAINT engagement_reaction_totals_kind_check
    CHECK (kind IN ('upvote', 'like')),
  CONSTRAINT engagement_reaction_totals_count_check
    CHECK (count >= 0)
);

CREATE TABLE IF NOT EXISTS engagement_view_counts (
  slug        TEXT NOT NULL,
  day         TEXT NOT NULL,
  count       INTEGER NOT NULL DEFAULT 0,

  PRIMARY KEY (slug, day),
  CONSTRAINT engagement_view_counts_count_check
    CHECK (count >= 0)
);

CREATE INDEX IF NOT EXISTS engagement_view_counts_day_idx
  ON engagement_view_counts (day);

-- table engagement_reactions: One row per (slug, kind, visitor) while the reaction is held; toggling off deletes it.
-- table engagement_reaction_totals: Denormalized count per (slug, kind), maintained by the repository alongside every toggle.
-- table engagement_view_counts: Daily counter per slug. day is YYYY-MM-DD (UTC).
