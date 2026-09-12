// The browser's view of site-api. Every call degrades: a network failure
// resolves to `null`, and the islands render a static message instead.

import type { RankedSlug, ReactionSummary, ViewSummary } from "@site/contracts/engagement";
import type { SubscribeResponse } from "@site/contracts/audience";
import type { FormSubmitResponse } from "@site/contracts/forms";

export interface ApiError {
  code: string;
  message: string;
  details: Record<string, unknown>;
}

export type ApiResult<T> = { ok: true; value: T } | { ok: false; error: ApiError };

export function apiBase(): string {
  return (process.env.NEXT_PUBLIC_SITE_API_URL || "").replace(/\/$/, "") || "http://localhost:8787";
}

async function call<T>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${apiBase()}${path}`, {
      method,
      headers: body !== undefined ? { "content-type": "application/json" } : {},
      body: body !== undefined ? JSON.stringify(body) : null,
    });
    if (res.status === 204) return { ok: true, value: undefined as T };
    const data = (await res.json()) as T | { error: ApiError };
    if (!res.ok) {
      const err = (data as { error?: ApiError }).error;
      return { ok: false, error: err ?? { code: `http_${res.status}`, message: res.statusText, details: {} } };
    }
    return { ok: true, value: data as T };
  } catch (err) {
    return { ok: false, error: { code: "network", message: err instanceof Error ? err.message : String(err), details: {} } };
  }
}

export const api = {
  subscribe: (email: string, source: string, turnstileToken?: string) =>
    call<SubscribeResponse>("POST", "/v1/subscribers", { email, source, ...(turnstileToken ? { turnstileToken } : {}) }),
  submitForm: (form: string, fields: Record<string, string>, honeypot: string, turnstileToken?: string) =>
    call<FormSubmitResponse>("POST", `/v1/forms/${form}`, { fields, honeypot, ...(turnstileToken ? { turnstileToken } : {}) }),
  reactions: (slug: string) => call<ReactionSummary>("GET", `/v1/reactions/${slug}`),
  react: (slug: string, kind: "upvote" | "like") => call<ReactionSummary>("POST", `/v1/reactions/${slug}`, { kind }),
  view: (slug: string) => call<void>("POST", `/v1/views/${slug}`),
  views: (slug: string) => call<ViewSummary>("GET", `/v1/views/${slug}`),
  top: (prefix: string, windowDays = 0, limit = 50) =>
    call<RankedSlug[]>("GET", `/v1/launches/top?prefix=${encodeURIComponent(prefix)}&windowDays=${windowDays}&limit=${limit}`),
};
