/**
 * Launches contract types — the launch directory (Launchpad variation).
 *
 * User-scoped: private surfaces live under `/v1/me/...` and are keyed by the
 * authenticated user; public surfaces (`/v1/launches*`, `/v1/makers/:handle`)
 * need no session. No organization appears in any path.
 */

// ---------------------------------------------------------------------------
// Public shapes
// ---------------------------------------------------------------------------

export type ProductStatus = "draft" | "live" | "archived";

export interface PublicMaker {
  handle: string;
  displayName: string;
  bio: string | null;
  websiteUrl: string | null;
  twitter: string | null;
  createdAt: string;
}

export interface PublicProduct {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  url: string;
  tags: string[];
  status: ProductStatus;
  launchedAt: string | null;
  upvoteCount: number;
  commentCount: number;
  /** The maker, when the read joined it (feed, product page). */
  maker: PublicMaker | null;
  /** Whether the requesting user has upvoted; false for anonymous reads. */
  viewerHasUpvoted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PublicComment {
  id: string;
  body: string;
  author: PublicMaker | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Public directory
// ---------------------------------------------------------------------------

export type FeedRange = "today" | "week" | "all";

export interface ListLaunchesQuery {
  range?: FeedRange;
  limit?: number;
}

export interface ListLaunchesResponse {
  products: PublicProduct[];
  range: FeedRange;
}

export interface GetLaunchResponse {
  product: PublicProduct;
}

export interface ListCommentsResponse {
  comments: PublicComment[];
}

export interface CreateCommentRequest {
  body: string;
}

export interface CreateCommentResponse {
  comment: PublicComment;
}

export interface UpvoteResponse {
  upvoteCount: number;
  viewerHasUpvoted: boolean;
}

export interface GetMakerResponse {
  maker: PublicMaker;
  products: PublicProduct[];
}

// ---------------------------------------------------------------------------
// Owner surface (/v1/me)
// ---------------------------------------------------------------------------

export interface ListMyProductsResponse {
  products: PublicProduct[];
}

export interface CreateProductRequest {
  name: string;
  tagline: string;
  url: string;
  /** Optional; derived from `name` when omitted. */
  slug?: string;
  description?: string;
  tags?: string[];
}

export interface UpdateProductRequest {
  name?: string;
  tagline?: string;
  url?: string;
  description?: string;
  tags?: string[];
  /** `archived` hides a live product; `draft` un-launches it. */
  status?: "archived" | "draft";
}

export interface ProductResponse {
  product: PublicProduct;
}

export interface GetMyProfileResponse {
  /** null until the user has created a maker profile. */
  maker: PublicMaker | null;
}

export interface UpsertMyProfileRequest {
  handle: string;
  displayName: string;
  bio?: string | null;
  websiteUrl?: string | null;
  twitter?: string | null;
}

export interface UpsertMyProfileResponse {
  maker: PublicMaker;
}
