export type { SqlExecutor, SqlExecutorResult, SqlRow } from "../d1/executor.js";

// ── Result type ─────────────────────────────────────────────

export type PagesRepositoryError =
  | { kind: "not_found" }
  | { kind: "conflict"; entity: string }
  | { kind: "internal"; message: string };

export type PagesResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: PagesRepositoryError };

// ── Entities ────────────────────────────────────────────────

export interface PageTheme {
  accent?: string;
  layout?: "list" | "grid";
}

export interface Page {
  userId: string;
  handle: string;
  title: string;
  bio: string | null;
  theme: PageTheme;
  published: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type BlockKind = "link" | "header" | "product" | "tip";

export interface Block {
  id: string;
  userId: string;
  kind: BlockKind;
  title: string;
  url: string | null;
  description: string | null;
  priceCents: number | null;
  currency: string | null;
  position: number;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClickRow {
  blockId: string;
  occurredAt: Date;
}

// ── Inputs ──────────────────────────────────────────────────

export interface UpsertPageInput {
  userId: string;
  handle: string;
  title: string;
  bio?: string | null;
  theme?: PageTheme;
  published?: boolean;
}

export interface CreateBlockInput {
  id: string;
  userId: string;
  kind: BlockKind;
  title: string;
  url?: string | null;
  description?: string | null;
  priceCents?: number | null;
  currency?: string | null;
}

export interface UpdateBlockInput {
  title?: string;
  url?: string | null;
  description?: string | null;
  priceCents?: number | null;
  currency?: string | null;
  enabled?: boolean;
}

// ── Repository ──────────────────────────────────────────────

export interface PagesRepository {
  getPageByUserId(userId: string): Promise<PagesResult<Page | null>>;
  getPublishedPageByHandle(handle: string): Promise<PagesResult<Page | null>>;
  upsertPage(input: UpsertPageInput): Promise<PagesResult<Page>>;

  listBlocks(userId: string): Promise<PagesResult<Block[]>>;
  listEnabledBlocks(userId: string): Promise<PagesResult<Block[]>>;
  getBlock(userId: string, blockId: string): Promise<PagesResult<Block>>;
  createBlock(input: CreateBlockInput): Promise<PagesResult<Block>>;
  updateBlock(userId: string, blockId: string, input: UpdateBlockInput): Promise<PagesResult<Block>>;
  deleteBlock(userId: string, blockId: string): Promise<PagesResult<void>>;
  /** Rewrites positions to the given order. `ids` must be exactly the owner's blocks. */
  reorderBlocks(userId: string, ids: string[]): Promise<PagesResult<Block[]>>;

  recordClick(input: { id: string; blockId: string; userId: string; referrer?: string | null }): Promise<PagesResult<void>>;
  /** Clicks for the owner since an instant, newest first. */
  clicksSince(userId: string, since: Date): Promise<PagesResult<ClickRow[]>>;
}
