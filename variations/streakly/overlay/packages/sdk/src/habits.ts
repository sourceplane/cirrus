import type {
  CheckInRequest,
  CheckInResponse,
  CreateHabitRequest,
  HabitResponse,
  ListHabitsResponse,
  ReorderHabitsRequest,
  ReorderHabitsResponse,
  ReviewResponse,
  TodayResponse,
  UpdateHabitRequest,
} from "@saas/contracts/habits";

import type { RequestOptions, Transport } from "./transport.js";

/**
 * Habits resource client (Streakly variation).
 *
 * Backed by `apps/habits-worker` via the api-edge `habits-facade`. Every call
 * needs a session — the tracker is private by design.
 *
 * Dates are the caller's local calendar dates as `YYYY-MM-DD`.
 */
export class HabitsClient {
  constructor(private readonly transport: Transport) {}

  /** GET /v1/me/habits */
  list(includeArchived = false, opts: RequestOptions = {}): Promise<ListHabitsResponse> {
    return this.transport.request<ListHabitsResponse>(
      { method: "GET", path: "/v1/me/habits", query: includeArchived ? { includeArchived: "true" } : {} },
      opts,
    );
  }

  /** POST /v1/me/habits */
  create(body: CreateHabitRequest, opts: RequestOptions = {}): Promise<HabitResponse> {
    return this.transport.request<HabitResponse>({ method: "POST", path: "/v1/me/habits", body }, opts);
  }

  /** PATCH /v1/me/habits/:id */
  update(habitId: string, body: UpdateHabitRequest, opts: RequestOptions = {}): Promise<HabitResponse> {
    return this.transport.request<HabitResponse>(
      { method: "PATCH", path: `/v1/me/habits/${encodeURIComponent(habitId)}`, body },
      opts,
    );
  }

  /** DELETE /v1/me/habits/:id */
  remove(habitId: string, opts: RequestOptions = {}): Promise<void> {
    return this.transport.request<void>({ method: "DELETE", path: `/v1/me/habits/${encodeURIComponent(habitId)}` }, opts);
  }

  /** POST /v1/me/habits/reorder */
  reorder(body: ReorderHabitsRequest, opts: RequestOptions = {}): Promise<ReorderHabitsResponse> {
    return this.transport.request<ReorderHabitsResponse>({ method: "POST", path: "/v1/me/habits/reorder", body }, opts);
  }

  /** PUT /v1/me/habits/:id/checkins/:date — idempotent. */
  checkIn(habitId: string, date: string, body: CheckInRequest = {}, opts: RequestOptions = {}): Promise<CheckInResponse> {
    return this.transport.request<CheckInResponse>(
      { method: "PUT", path: `/v1/me/habits/${encodeURIComponent(habitId)}/checkins/${encodeURIComponent(date)}`, body },
      opts,
    );
  }

  /** DELETE /v1/me/habits/:id/checkins/:date */
  undoCheckIn(habitId: string, date: string, opts: RequestOptions = {}): Promise<void> {
    return this.transport.request<void>(
      { method: "DELETE", path: `/v1/me/habits/${encodeURIComponent(habitId)}/checkins/${encodeURIComponent(date)}` },
      opts,
    );
  }

  /** GET /v1/me/today?date= */
  today(date: string, opts: RequestOptions = {}): Promise<TodayResponse> {
    return this.transport.request<TodayResponse>({ method: "GET", path: "/v1/me/today", query: { date } }, opts);
  }

  /** GET /v1/me/review?weekStart= */
  review(weekStart: string, opts: RequestOptions = {}): Promise<ReviewResponse> {
    return this.transport.request<ReviewResponse>({ method: "GET", path: "/v1/me/review", query: { weekStart } }, opts);
  }
}
