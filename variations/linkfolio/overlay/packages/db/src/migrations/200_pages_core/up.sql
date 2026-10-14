-- 200_pages_core
-- Pages persistence foundation — one public page per user, its ordered blocks,
-- and the click log behind the analytics view.
-- Bounded context: pages (user-scoped: every row hangs off a user id, never an org)
-- Idempotent: uses IF NOT EXISTS throughout.
-- No cross-context foreign keys: user_id is an opaque identity reference.
-- schema pages: Pages bounded context — the creator's link-in-bio page and storefront.

-- ============================================================
-- Page: exactly one per user, addressed publicly by its handle.
-- ============================================================

CREATE TABLE IF NOT EXISTS pages_pages (
  user_id      TEXT        PRIMARY KEY,
  handle       TEXT        NOT NULL,
  title        TEXT        NOT NULL,
  bio          TEXT,
  theme        TEXT        NOT NULL DEFAULT '{}',
  published    INTEGER     NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS pages_pages_handle_idx
  ON pages_pages (handle);

-- table pages_pages: The creator's page, keyed by the identity user id.
-- column pages_pages.handle: URL handle (lowercase slug), unique across the product.
-- column pages_pages.theme: JSON document — { accent, layout }.
-- column pages_pages.published: 0/1; an unpublished page 404s publicly.

-- ============================================================
-- Blocks: the ordered content of a page.
-- ============================================================

CREATE TABLE IF NOT EXISTS pages_blocks (
  id           TEXT        PRIMARY KEY,
  user_id      TEXT        NOT NULL,
  kind         TEXT        NOT NULL,
  title        TEXT        NOT NULL,
  url          TEXT,
  description  TEXT,
  price_cents  INTEGER,
  currency     TEXT,
  position     INTEGER     NOT NULL,
  enabled      INTEGER     NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  CONSTRAINT pages_blocks_kind_check CHECK (kind IN ('link', 'header', 'product', 'tip')),
  -- A header is a label; everything a visitor can click needs somewhere to go.
  CONSTRAINT pages_blocks_url_check CHECK (kind = 'header' OR url IS NOT NULL),
  CONSTRAINT pages_blocks_price_check CHECK (price_cents IS NULL OR price_cents >= 0)
);

CREATE INDEX IF NOT EXISTS pages_blocks_user_position_idx
  ON pages_blocks (user_id, position ASC, id ASC);

-- table pages_blocks: One block of a page — a link, a section header, a product, or a tip jar.
-- column pages_blocks.position: Sort key within the page; rewritten wholesale by reorder.
-- column pages_blocks.price_cents: Minor units, for product/tip blocks only.

-- ============================================================
-- Clicks: one row per visitor interaction, the analytics source.
-- ============================================================

CREATE TABLE IF NOT EXISTS pages_clicks (
  id           TEXT        PRIMARY KEY,
  block_id     TEXT        NOT NULL REFERENCES pages_blocks(id),
  user_id      TEXT        NOT NULL,
  occurred_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  referrer     TEXT
);

CREATE INDEX IF NOT EXISTS pages_clicks_user_occurred_idx
  ON pages_clicks (user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS pages_clicks_block_occurred_idx
  ON pages_clicks (block_id, occurred_at DESC);

-- table pages_clicks: Append-only click log; user_id is the PAGE OWNER, not the visitor.
-- column pages_clicks.referrer: Visitor-supplied, untrusted, truncated by the worker.
