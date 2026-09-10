import type {
  AnalyticsResponse,
  BlockResponse,
  CreateBlockRequest,
  GetMyPageResponse,
  GetPublicPageResponse,
  ListBlocksResponse,
  RecordClickRequest,
  RecordClickResponse,
  ReorderBlocksRequest,
  ReorderBlocksResponse,
  UpdateBlockRequest,
  UpsertMyPageRequest,
  UpsertMyPageResponse,
} from "@saas/contracts/pages";

import type { RequestOptions, Transport } from "./transport.js";

/**
 * Pages resource client (Linkfolio variation).
 *
 * Backed by `apps/pages-worker` via the api-edge `pages-facade`. The owner
 * surface (`/v1/me/page...`) needs a session; the public page and its click
 * endpoint work without one, so a visitor's browser can call them directly.
 */
export class PagesClient {
  constructor(private readonly transport: Transport) {}

  // ── Owner surface ───────────────────────────────────────

  /** GET /v1/me/page */
  getMyPage(opts: RequestOptions = {}): Promise<GetMyPageResponse> {
    return this.transport.request<GetMyPageResponse>({ method: "GET", path: "/v1/me/page" }, opts);
  }

  /** PUT /v1/me/page */
  upsertMyPage(body: UpsertMyPageRequest, opts: RequestOptions = {}): Promise<UpsertMyPageResponse> {
    return this.transport.request<UpsertMyPageResponse>({ method: "PUT", path: "/v1/me/page", body }, opts);
  }

  /** GET /v1/me/page/blocks */
  listBlocks(opts: RequestOptions = {}): Promise<ListBlocksResponse> {
    return this.transport.request<ListBlocksResponse>({ method: "GET", path: "/v1/me/page/blocks" }, opts);
  }

  /** POST /v1/me/page/blocks */
  createBlock(body: CreateBlockRequest, opts: RequestOptions = {}): Promise<BlockResponse> {
    return this.transport.request<BlockResponse>({ method: "POST", path: "/v1/me/page/blocks", body }, opts);
  }

  /** PATCH /v1/me/page/blocks/:id */
  updateBlock(blockId: string, body: UpdateBlockRequest, opts: RequestOptions = {}): Promise<BlockResponse> {
    return this.transport.request<BlockResponse>(
      { method: "PATCH", path: `/v1/me/page/blocks/${encodeURIComponent(blockId)}`, body },
      opts,
    );
  }

  /** DELETE /v1/me/page/blocks/:id */
  deleteBlock(blockId: string, opts: RequestOptions = {}): Promise<void> {
    return this.transport.request<void>({ method: "DELETE", path: `/v1/me/page/blocks/${encodeURIComponent(blockId)}` }, opts);
  }

  /** POST /v1/me/page/blocks/reorder */
  reorderBlocks(body: ReorderBlocksRequest, opts: RequestOptions = {}): Promise<ReorderBlocksResponse> {
    return this.transport.request<ReorderBlocksResponse>({ method: "POST", path: "/v1/me/page/blocks/reorder", body }, opts);
  }

  /** GET /v1/me/page/analytics?days= */
  analytics(days?: number, opts: RequestOptions = {}): Promise<AnalyticsResponse> {
    return this.transport.request<AnalyticsResponse>({ method: "GET", path: "/v1/me/page/analytics", query: { days } }, opts);
  }

  // ── Public page ─────────────────────────────────────────

  /** GET /v1/p/:handle */
  getPublic(handle: string, opts: RequestOptions = {}): Promise<GetPublicPageResponse> {
    return this.transport.request<GetPublicPageResponse>({ method: "GET", path: `/v1/p/${encodeURIComponent(handle)}` }, opts);
  }

  /** POST /v1/p/:handle/blocks/:id/click */
  click(handle: string, blockId: string, body: RecordClickRequest = {}, opts: RequestOptions = {}): Promise<RecordClickResponse> {
    return this.transport.request<RecordClickResponse>(
      { method: "POST", path: `/v1/p/${encodeURIComponent(handle)}/blocks/${encodeURIComponent(blockId)}/click`, body },
      opts,
    );
  }
}
