export type { SqlExecutor, SqlExecutorResult, SqlRow } from "../d1/executor.js";

// ── Result type ─────────────────────────────────────────────

export type LaunchesRepositoryError =
  | { kind: "not_found" }
  | { kind: "conflict"; entity: string }
  | { kind: "internal"; message: string };

export type LaunchesResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: LaunchesRepositoryError };

// ── Entities ────────────────────────────────────────────────

export interface Maker {
  userId: string;
  handle: string;
  displayName: string;
  bio: string | null;
  websiteUrl: string | null;
  twitter: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ProductStatus = "draft" | "live" | "archived";

export interface Product {
  id: string;
  userId: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  url: string;
  tags: string[];
  status: ProductStatus;
  launchedAt: Date | null;
  upvoteCount: number;
  commentCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Comment {
  id: string;
  productId: string;
  userId: string;
  body: string;
  createdAt: Date;
}

// ── Inputs ──────────────────────────────────────────────────

export interface UpsertMakerInput {
  userId: string;
  handle: string;
  displayName: string;
  bio?: string | null;
  websiteUrl?: string | null;
  twitter?: string | null;
}

export interface CreateProductInput {
  id: string;
  userId: string;
  slug: string;
  name: string;
  tagline: string;
  description?: string;
  url: string;
  tags?: string[];
}

export interface UpdateProductInput {
  name?: string;
  tagline?: string;
  description?: string;
  url?: string;
  tags?: string[];
  status?: "archived" | "draft";
}

export type FeedRange = "today" | "week" | "all";

export interface FeedQuery {
  range: FeedRange;
  limit: number;
  /** Instant the feed is computed against (tests pin it). */
  now: Date;
}

// ── Repository ──────────────────────────────────────────────

export interface LaunchesRepository {
  // Makers
  getMakerByUserId(userId: string): Promise<LaunchesResult<Maker | null>>;
  getMakerByHandle(handle: string): Promise<LaunchesResult<Maker | null>>;
  upsertMaker(input: UpsertMakerInput): Promise<LaunchesResult<Maker>>;

  // Products (owner side)
  createProduct(input: CreateProductInput): Promise<LaunchesResult<Product>>;
  listProductsByUser(userId: string): Promise<LaunchesResult<Product[]>>;
  getProductForUser(userId: string, productId: string): Promise<LaunchesResult<Product>>;
  updateProduct(userId: string, productId: string, input: UpdateProductInput): Promise<LaunchesResult<Product>>;
  launchProduct(userId: string, productId: string, launchedAt: Date): Promise<LaunchesResult<Product>>;
  deleteProduct(userId: string, productId: string): Promise<LaunchesResult<void>>;

  // Public
  feed(query: FeedQuery): Promise<LaunchesResult<Product[]>>;
  getLiveProductBySlug(slug: string): Promise<LaunchesResult<Product | null>>;
  listLiveProductsByUser(userId: string): Promise<LaunchesResult<Product[]>>;

  // Votes & comments
  upvote(productId: string, userId: string): Promise<LaunchesResult<{ upvoteCount: number; changed: boolean }>>;
  removeUpvote(productId: string, userId: string): Promise<LaunchesResult<{ upvoteCount: number; changed: boolean }>>;
  hasUpvoted(userId: string, productIds: string[]): Promise<LaunchesResult<Set<string>>>;
  addComment(input: { id: string; productId: string; userId: string; body: string }): Promise<LaunchesResult<Comment>>;
  listComments(productId: string, limit: number): Promise<LaunchesResult<Comment[]>>;
}
