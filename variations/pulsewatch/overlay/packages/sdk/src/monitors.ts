import type {
  CreateMonitorRequest,
  GetStatusPageResponse,
  ListChecksResponse,
  ListIncidentsResponse,
  ListMonitorsResponse,
  MonitorResponse,
  PublicStatusResponse,
  RunCheckResponse,
  StatusPageResponse,
  UpdateMonitorRequest,
  UpsertStatusPageRequest,
} from "@saas/contracts/monitors";

import type { RequestOptions, Transport } from "./transport.js";

/**
 * Monitors resource client (Pulsewatch variation).
 *
 * Backed by `apps/monitors-worker` via the api-edge `monitors-facade`. The
 * owner surface needs a session; the status page read works without one.
 */
export class MonitorsClient {
  constructor(private readonly transport: Transport) {}

  /** GET /v1/me/monitors */
  list(opts: RequestOptions = {}): Promise<ListMonitorsResponse> {
    return this.transport.request<ListMonitorsResponse>({ method: "GET", path: "/v1/me/monitors" }, opts);
  }

  /** POST /v1/me/monitors */
  create(body: CreateMonitorRequest, opts: RequestOptions = {}): Promise<MonitorResponse> {
    return this.transport.request<MonitorResponse>({ method: "POST", path: "/v1/me/monitors", body }, opts);
  }

  /** GET /v1/me/monitors/:id */
  get(id: string, opts: RequestOptions = {}): Promise<MonitorResponse> {
    return this.transport.request<MonitorResponse>({ method: "GET", path: `/v1/me/monitors/${encodeURIComponent(id)}` }, opts);
  }

  /** PATCH /v1/me/monitors/:id */
  update(id: string, body: UpdateMonitorRequest, opts: RequestOptions = {}): Promise<MonitorResponse> {
    return this.transport.request<MonitorResponse>({ method: "PATCH", path: `/v1/me/monitors/${encodeURIComponent(id)}`, body }, opts);
  }

  /** DELETE /v1/me/monitors/:id */
  remove(id: string, opts: RequestOptions = {}): Promise<void> {
    return this.transport.request<void>({ method: "DELETE", path: `/v1/me/monitors/${encodeURIComponent(id)}` }, opts);
  }

  /** GET /v1/me/monitors/:id/checks?limit= */
  checks(id: string, limit?: number, opts: RequestOptions = {}): Promise<ListChecksResponse> {
    return this.transport.request<ListChecksResponse>(
      { method: "GET", path: `/v1/me/monitors/${encodeURIComponent(id)}/checks`, query: { limit } },
      opts,
    );
  }

  /** POST /v1/me/monitors/:id/check — probe now. */
  runCheck(id: string, opts: RequestOptions = {}): Promise<RunCheckResponse> {
    return this.transport.request<RunCheckResponse>({ method: "POST", path: `/v1/me/monitors/${encodeURIComponent(id)}/check` }, opts);
  }

  /** GET /v1/me/incidents?limit= */
  incidents(limit?: number, opts: RequestOptions = {}): Promise<ListIncidentsResponse> {
    return this.transport.request<ListIncidentsResponse>({ method: "GET", path: "/v1/me/incidents", query: { limit } }, opts);
  }

  /** GET /v1/me/status-page */
  getStatusPage(opts: RequestOptions = {}): Promise<GetStatusPageResponse> {
    return this.transport.request<GetStatusPageResponse>({ method: "GET", path: "/v1/me/status-page" }, opts);
  }

  /** PUT /v1/me/status-page */
  upsertStatusPage(body: UpsertStatusPageRequest, opts: RequestOptions = {}): Promise<StatusPageResponse> {
    return this.transport.request<StatusPageResponse>({ method: "PUT", path: "/v1/me/status-page", body }, opts);
  }

  /** GET /v1/status/:handle — public. */
  publicStatus(handle: string, opts: RequestOptions = {}): Promise<PublicStatusResponse> {
    return this.transport.request<PublicStatusResponse>({ method: "GET", path: `/v1/status/${encodeURIComponent(handle)}` }, opts);
  }
}
