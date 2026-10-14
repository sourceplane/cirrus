import type {
  CreateCommentRequest,
  CreateCommentResponse,
  CreateProductRequest,
  GetLaunchResponse,
  GetMakerResponse,
  GetMyProfileResponse,
  ListCommentsResponse,
  ListLaunchesQuery,
  ListLaunchesResponse,
  ListMyProductsResponse,
  ProductResponse,
  UpdateProductRequest,
  UpsertMyProfileRequest,
  UpsertMyProfileResponse,
  UpvoteResponse,
} from "@saas/contracts/launches";

import type { RequestOptions, Transport } from "./transport.js";

/**
 * Launches resource client (Launchpad variation).
 *
 * Backed by `apps/launches-worker` via the api-edge `launches-facade`. The
 * directory reads work without a token; the owner surface (`/v1/me/...`),
 * voting and commenting need a session.
 */
export class LaunchesClient {
  constructor(private readonly transport: Transport) {}

  // ── Directory (public) ──────────────────────────────────

  /** GET /v1/launches?range=&limit= */
  list(query: ListLaunchesQuery = {}, opts: RequestOptions = {}): Promise<ListLaunchesResponse> {
    return this.transport.request<ListLaunchesResponse>(
      { method: "GET", path: "/v1/launches", query: { range: query.range, limit: query.limit } },
      opts,
    );
  }

  /** GET /v1/launches/:slug */
  get(slug: string, opts: RequestOptions = {}): Promise<GetLaunchResponse> {
    return this.transport.request<GetLaunchResponse>({ method: "GET", path: `/v1/launches/${encodeURIComponent(slug)}` }, opts);
  }

  /** GET /v1/launches/:slug/comments */
  listComments(slug: string, opts: RequestOptions = {}): Promise<ListCommentsResponse> {
    return this.transport.request<ListCommentsResponse>(
      { method: "GET", path: `/v1/launches/${encodeURIComponent(slug)}/comments` },
      opts,
    );
  }

  /** POST /v1/launches/:slug/comments */
  addComment(slug: string, body: CreateCommentRequest, opts: RequestOptions = {}): Promise<CreateCommentResponse> {
    return this.transport.request<CreateCommentResponse>(
      { method: "POST", path: `/v1/launches/${encodeURIComponent(slug)}/comments`, body },
      opts,
    );
  }

  /** PUT /v1/launches/:slug/upvote */
  upvote(slug: string, opts: RequestOptions = {}): Promise<UpvoteResponse> {
    return this.transport.request<UpvoteResponse>({ method: "PUT", path: `/v1/launches/${encodeURIComponent(slug)}/upvote` }, opts);
  }

  /** DELETE /v1/launches/:slug/upvote */
  removeUpvote(slug: string, opts: RequestOptions = {}): Promise<UpvoteResponse> {
    return this.transport.request<UpvoteResponse>({ method: "DELETE", path: `/v1/launches/${encodeURIComponent(slug)}/upvote` }, opts);
  }

  /** GET /v1/makers/:handle */
  getMaker(handle: string, opts: RequestOptions = {}): Promise<GetMakerResponse> {
    return this.transport.request<GetMakerResponse>({ method: "GET", path: `/v1/makers/${encodeURIComponent(handle)}` }, opts);
  }

  // ── Owner surface (/v1/me) ──────────────────────────────

  /** GET /v1/me/products */
  listMine(opts: RequestOptions = {}): Promise<ListMyProductsResponse> {
    return this.transport.request<ListMyProductsResponse>({ method: "GET", path: "/v1/me/products" }, opts);
  }

  /** POST /v1/me/products */
  create(body: CreateProductRequest, opts: RequestOptions = {}): Promise<ProductResponse> {
    return this.transport.request<ProductResponse>({ method: "POST", path: "/v1/me/products", body }, opts);
  }

  /** GET /v1/me/products/:id */
  getMine(productId: string, opts: RequestOptions = {}): Promise<ProductResponse> {
    return this.transport.request<ProductResponse>({ method: "GET", path: `/v1/me/products/${encodeURIComponent(productId)}` }, opts);
  }

  /** PATCH /v1/me/products/:id */
  update(productId: string, body: UpdateProductRequest, opts: RequestOptions = {}): Promise<ProductResponse> {
    return this.transport.request<ProductResponse>(
      { method: "PATCH", path: `/v1/me/products/${encodeURIComponent(productId)}`, body },
      opts,
    );
  }

  /** POST /v1/me/products/:id/launch */
  launch(productId: string, opts: RequestOptions = {}): Promise<ProductResponse> {
    return this.transport.request<ProductResponse>(
      { method: "POST", path: `/v1/me/products/${encodeURIComponent(productId)}/launch` },
      opts,
    );
  }

  /** DELETE /v1/me/products/:id */
  delete(productId: string, opts: RequestOptions = {}): Promise<void> {
    return this.transport.request<void>({ method: "DELETE", path: `/v1/me/products/${encodeURIComponent(productId)}` }, opts);
  }

  /** GET /v1/me/profile */
  getMyProfile(opts: RequestOptions = {}): Promise<GetMyProfileResponse> {
    return this.transport.request<GetMyProfileResponse>({ method: "GET", path: "/v1/me/profile" }, opts);
  }

  /** PUT /v1/me/profile */
  upsertMyProfile(body: UpsertMyProfileRequest, opts: RequestOptions = {}): Promise<UpsertMyProfileResponse> {
    return this.transport.request<UpsertMyProfileResponse>({ method: "PUT", path: "/v1/me/profile", body }, opts);
  }
}
