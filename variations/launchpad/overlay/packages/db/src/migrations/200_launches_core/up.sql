-- 200_launches_core
-- Launches persistence foundation — maker profiles, products, upvotes, comments.
-- Bounded context: launches (user-scoped: every row hangs off a user id, never an org)
-- Idempotent: uses IF NOT EXISTS throughout.
-- No cross-context foreign keys: user_id is an opaque identity reference.
-- schema launches: Launches bounded context — the launch directory (products, votes, comments, maker profiles).

-- ============================================================
-- Makers: the public profile of a user who launches. One row per user.
-- ============================================================

CREATE TABLE IF NOT EXISTS launches_makers (
  user_id       TEXT        PRIMARY KEY,
  handle        TEXT        NOT NULL,
  display_name  TEXT        NOT NULL,
  bio           TEXT,
  website_url   TEXT,
  twitter       TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS launches_makers_handle_idx
  ON launches_makers (handle);

-- table launches_makers: Public maker profile, keyed by the identity user id.
-- column launches_makers.handle: URL handle (lowercase slug), unique across the directory.

-- ============================================================
-- Products: a launch. Draft until launched; live products appear in the feed.
-- ============================================================

CREATE TABLE IF NOT EXISTS launches_products (
  id             TEXT        PRIMARY KEY,
  user_id        TEXT        NOT NULL,
  slug           TEXT        NOT NULL,
  name           TEXT        NOT NULL,
  tagline        TEXT        NOT NULL,
  description    TEXT        NOT NULL DEFAULT '',
  url            TEXT        NOT NULL,
  tags           TEXT        NOT NULL DEFAULT '[]',
  status         TEXT        NOT NULL DEFAULT 'draft',
  launched_at    TEXT,
  upvote_count   INTEGER     NOT NULL DEFAULT 0,
  comment_count  INTEGER     NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  CONSTRAINT launches_products_status_check CHECK (status IN ('draft', 'live', 'archived')),
  CONSTRAINT launches_products_live_launched_check CHECK (status <> 'live' OR launched_at IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS launches_products_slug_idx
  ON launches_products (slug);

CREATE INDEX IF NOT EXISTS launches_products_user_created_idx
  ON launches_products (user_id, created_at DESC, id DESC);

-- The feed: live products ranked by votes, then recency.
CREATE INDEX IF NOT EXISTS launches_products_feed_idx
  ON launches_products (status, launched_at DESC, upvote_count DESC, id DESC);

-- table launches_products: A product launch owned by one user.
-- column launches_products.tags: JSON array of lowercase tag strings.
-- column launches_products.status: draft (owner only), live (in the feed), archived (hidden).
-- column launches_products.upvote_count: Denormalised count, maintained by the upvote writes.

-- ============================================================
-- Upvotes: one per user per product.
-- ============================================================

CREATE TABLE IF NOT EXISTS launches_upvotes (
  product_id  TEXT NOT NULL REFERENCES launches_products(id),
  user_id     TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (product_id, user_id)
);

CREATE INDEX IF NOT EXISTS launches_upvotes_user_idx
  ON launches_upvotes (user_id, created_at DESC);

-- table launches_upvotes: One vote per (product, user); the primary key is the guard.

-- ============================================================
-- Comments: flat, chronological.
-- ============================================================

CREATE TABLE IF NOT EXISTS launches_comments (
  id          TEXT PRIMARY KEY,
  product_id  TEXT NOT NULL REFERENCES launches_products(id),
  user_id     TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS launches_comments_product_created_idx
  ON launches_comments (product_id, created_at ASC, id ASC);

-- table launches_comments: Comments on a product, oldest first.
