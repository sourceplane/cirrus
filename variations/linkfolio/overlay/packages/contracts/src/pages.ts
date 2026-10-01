/**
 * Pages contract types — the creator's link-in-bio page and storefront
 * (Linkfolio variation).
 *
 * User-scoped: the owner surface lives under `/v1/me/page...` and is keyed by
 * the authenticated user; the public page (`/v1/p/:handle`) and its click
 * endpoint need no session. No organization appears in any path.
 */

export type BlockKind = "link" | "header" | "product" | "tip";

export interface PageTheme {
  accent?: string;
  layout?: "list" | "grid";
}

export interface PublicBlock {
  id: string;
  kind: BlockKind;
  title: string;
  url: string | null;
  description: string | null;
  priceCents: number | null;
  currency: string | null;
  position: number;
  enabled: boolean;
}

export interface PublicPage {
  handle: string;
  title: string;
  bio: string | null;
  theme: PageTheme;
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Owner surface (/v1/me/page) ─────────────────────────────

export interface GetMyPageResponse {
  /** null until the creator has claimed a handle. */
  page: PublicPage | null;
}

export interface UpsertMyPageRequest {
  handle: string;
  title: string;
  bio?: string | null;
  theme?: PageTheme;
  published?: boolean;
}

export interface UpsertMyPageResponse {
  page: PublicPage;
}

export interface ListBlocksResponse {
  blocks: PublicBlock[];
}

export interface CreateBlockRequest {
  kind: BlockKind;
  title: string;
  url?: string | null;
  description?: string | null;
  priceCents?: number | null;
  currency?: string | null;
}

export interface UpdateBlockRequest {
  title?: string;
  url?: string | null;
  description?: string | null;
  priceCents?: number | null;
  currency?: string | null;
  enabled?: boolean;
}

export interface BlockResponse {
  block: PublicBlock;
}

export interface ReorderBlocksRequest {
  /** Exactly the owner's block ids, in the order they should render. */
  ids: string[];
}

export interface ReorderBlocksResponse {
  blocks: PublicBlock[];
}

// ── Analytics ───────────────────────────────────────────────

export interface BlockClickCount {
  blockId: string;
  title: string;
  clicks: number;
}

export interface DailyClickCount {
  /** `YYYY-MM-DD` (UTC). */
  date: string;
  clicks: number;
}

export interface AnalyticsResponse {
  days: number;
  totalClicks: number;
  byBlock: BlockClickCount[];
  byDay: DailyClickCount[];
}

// ── Public page (/v1/p/:handle) ─────────────────────────────

export interface GetPublicPageResponse {
  page: PublicPage;
  blocks: PublicBlock[];
}

export interface RecordClickRequest {
  referrer?: string | null;
}

export interface RecordClickResponse {
  /** Where the visitor should be sent. */
  url: string;
}
