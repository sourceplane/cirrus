// The owner client: bearer token, JSON in and out, typed failures.

import type { ErrorEnvelope } from "@site/contracts/errors";

export interface ClientConfig {
  apiUrl: string;
  token: string | null;
  fetch: typeof fetch;
}

export type ClientFailure =
  | { kind: "network"; message: string }
  | { kind: "unauthenticated"; message: string }
  | { kind: "api"; status: number; code: string; message: string; details: Record<string, unknown> };

export type ClientResult<T> = { ok: true; value: T; status: number } | { ok: false; failure: ClientFailure };

export interface OwnerClient {
  json<T>(method: string, path: string, body?: unknown): Promise<ClientResult<T>>;
  text(method: string, path: string): Promise<ClientResult<string>>;
}

export function createClient(config: ClientConfig): OwnerClient {
  const base = config.apiUrl.replace(/\/$/, "");
  async function request(method: string, path: string, body?: unknown): Promise<ClientResult<Response>> {
    const headers: Record<string, string> = { "user-agent": "virga-cli" };
    if (config.token) headers.authorization = `Bearer ${config.token}`;
    if (body !== undefined) headers["content-type"] = "application/json";
    let res: Response;
    try {
      res = await config.fetch(`${base}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : null });
    } catch (err) {
      return { ok: false, failure: { kind: "network", message: err instanceof Error ? err.message : String(err) } };
    }
    if (res.ok) return { ok: true, value: res, status: res.status };
    let envelope: ErrorEnvelope["error"] | null = null;
    try {
      envelope = ((await res.json()) as ErrorEnvelope).error ?? null;
    } catch {
      envelope = null;
    }
    const code = envelope?.code ?? `http_${res.status}`;
    const message = envelope?.message ?? res.statusText;
    if (res.status === 401) return { ok: false, failure: { kind: "unauthenticated", message } };
    return { ok: false, failure: { kind: "api", status: res.status, code, message, details: envelope?.details ?? {} } };
  }
  return {
    async json<T>(method: string, path: string, body?: unknown) {
      const r = await request(method, path, body);
      if (!r.ok) return r;
      if (r.status === 204) return { ok: true, value: undefined as T, status: r.status };
      return { ok: true, value: (await r.value.json()) as T, status: r.status };
    },
    async text(method: string, path: string) {
      const r = await request(method, path);
      if (!r.ok) return r;
      return { ok: true, value: await r.value.text(), status: r.status };
    },
  };
}
