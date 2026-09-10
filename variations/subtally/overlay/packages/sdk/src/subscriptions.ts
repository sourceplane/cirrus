import type {
  CreateSubscriptionRequest,
  ListSubscriptionsResponse,
  SubscriptionResponse,
  TrackedSubscriptionStatus,
  SummaryResponse,
  UpcomingResponse,
  UpdateSubscriptionRequest,
} from "@saas/contracts/subscriptions";

import type { RequestOptions, Transport } from "./transport.js";

/**
 * Subscriptions resource client (Subtally variation).
 *
 * Backed by `apps/subscriptions-worker` via the api-edge
 * `subscriptions-facade`. Every call needs a session — the tracker is private.
 *
 * `asOf` (a `YYYY-MM-DD` date) pins the reference day for every derived value;
 * leave it out and the server uses today.
 */
export class SubscriptionsClient {
  constructor(private readonly transport: Transport) {}

  /** GET /v1/me/subscriptions */
  list(status?: TrackedSubscriptionStatus, opts: RequestOptions = {}): Promise<ListSubscriptionsResponse> {
    return this.transport.request<ListSubscriptionsResponse>(
      { method: "GET", path: "/v1/me/subscriptions", query: { status } },
      opts,
    );
  }

  /** POST /v1/me/subscriptions */
  create(body: CreateSubscriptionRequest, opts: RequestOptions = {}): Promise<SubscriptionResponse> {
    return this.transport.request<SubscriptionResponse>({ method: "POST", path: "/v1/me/subscriptions", body }, opts);
  }

  /** GET /v1/me/subscriptions/:id */
  get(id: string, opts: RequestOptions = {}): Promise<SubscriptionResponse> {
    return this.transport.request<SubscriptionResponse>({ method: "GET", path: `/v1/me/subscriptions/${encodeURIComponent(id)}` }, opts);
  }

  /** PATCH /v1/me/subscriptions/:id */
  update(id: string, body: UpdateSubscriptionRequest, opts: RequestOptions = {}): Promise<SubscriptionResponse> {
    return this.transport.request<SubscriptionResponse>(
      { method: "PATCH", path: `/v1/me/subscriptions/${encodeURIComponent(id)}`, body },
      opts,
    );
  }

  /** DELETE /v1/me/subscriptions/:id */
  remove(id: string, opts: RequestOptions = {}): Promise<void> {
    return this.transport.request<void>({ method: "DELETE", path: `/v1/me/subscriptions/${encodeURIComponent(id)}` }, opts);
  }

  /** GET /v1/me/subscriptions/summary */
  summary(asOf?: string, opts: RequestOptions = {}): Promise<SummaryResponse> {
    return this.transport.request<SummaryResponse>({ method: "GET", path: "/v1/me/subscriptions/summary", query: { asOf } }, opts);
  }

  /** GET /v1/me/subscriptions/upcoming?days= */
  upcoming(days?: number, asOf?: string, opts: RequestOptions = {}): Promise<UpcomingResponse> {
    return this.transport.request<UpcomingResponse>(
      { method: "GET", path: "/v1/me/subscriptions/upcoming", query: { days, asOf } },
      opts,
    );
  }
}
