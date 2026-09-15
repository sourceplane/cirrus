import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { MailSendRequest, BroadcastRequest } from "@site/contracts";
import { testDatabase } from "@site/testing/sqlite";
import type { Env } from "@site-api/env";
import { route } from "@site-api/router";
import { __resetRateLimitMemoryForTest } from "@site-api/rate-limit";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_ROOT = resolve(__dirname, "../../..", "packages/db/src/migrations");

/** An in-memory KV namespace with TTL semantics good enough for the limiter. */
export function fakeKv(): KVNamespace & { store: Map<string, string>; fail?: boolean } {
  const store = new Map<string, string>();
  const kv = {
    store,
    fail: false,
    async get(key: string) {
      if (kv.fail) throw new Error("kv down");
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      if (kv.fail) throw new Error("kv down");
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
  };
  return kv as unknown as KVNamespace & { store: Map<string, string>; fail?: boolean };
}

export interface MailRecorder {
  fetcher: Fetcher;
  sent: MailSendRequest[];
  broadcasts: BroadcastRequest[];
  /** Override what /v1/mail/broadcast answers. */
  broadcastResponse: () => Response;
  down: boolean;
}

export function fakeMail(): MailRecorder {
  const rec: MailRecorder = {
    sent: [],
    broadcasts: [],
    down: false,
    broadcastResponse: () =>
      Response.json({ issueId: "iss_x", status: "sent", queued: 0, sent: 2, failed: 0, skipped: 0 }),
    fetcher: {
      async fetch(input: RequestInfo | URL, init?: RequestInit) {
        if (rec.down) throw new Error("mail-worker unreachable");
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        const body = JSON.parse(String(init?.body ?? "{}")) as MailSendRequest & BroadcastRequest;
        if (url.endsWith("/v1/mail/send")) {
          rec.sent.push(body);
          return Response.json({ ok: true, provider: "fake", providerMessageId: `m-${rec.sent.length}`, error: null });
        }
        if (url.endsWith("/v1/mail/broadcast")) {
          rec.broadcasts.push(body);
          return rec.broadcastResponse();
        }
        return Response.json({ error: { code: "not_found" } }, { status: 404 });
      },
    } as unknown as Fetcher,
  };
  return rec;
}

export const OWNER_TOKEN = "owner-token-0123456789abcdef";
export const TOKEN_SECRET = "token-secret-for-tests";

export interface Harness {
  env: Env;
  db: ReturnType<typeof testDatabase>["db"];
  kv: ReturnType<typeof fakeKv>;
  mail: MailRecorder;
  now: Date;
  call(method: string, path: string, init?: { body?: unknown; headers?: Record<string, string>; ip?: string }): Promise<Response>;
  owner(method: string, path: string, body?: unknown): Promise<Response>;
}

export type EnvOverrides = { [K in keyof Env]?: Env[K] | undefined };

export function harness(overrides: EnvOverrides = {}): Harness {
  __resetRateLimitMemoryForTest();
  const { db, binding } = testDatabase(MIGRATIONS_ROOT);
  const kv = fakeKv();
  const mail = fakeMail();
  const env: Env = {
    SITE_DB: binding as unknown as D1Database,
    RATE_LIMIT_KV: kv,
    MAIL_WORKER: mail.fetcher,
    ENVIRONMENT: "test",
    SITE_NAME: "Virga Test",
    SITE_URL: "https://site.test",
    SITE_ORIGINS: "https://site.test",
    OWNER_TOKEN,
    TOKEN_SECRET,
    FINGERPRINT_SALT: "salt",
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete (env as unknown as Record<string, unknown>)[key];
    else (env as unknown as Record<string, unknown>)[key] = value;
  }
  const h: Harness = {
    env,
    db,
    kv,
    mail,
    now: new Date("2026-03-04T05:06:07.000Z"),
    call(method, path, init = {}) {
      const headers: Record<string, string> = {
        "cf-connecting-ip": init.ip ?? "203.0.113.7",
        "user-agent": "jest",
        ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
        ...(init.headers ?? {}),
      };
      const request = new Request(`https://api.test${path}`, {
        method,
        headers,
        body: init.body !== undefined ? JSON.stringify(init.body) : null,
      });
      return route(request, env, { now: () => h.now });
    },
    owner(method, path, body) {
      return h.call(method, path, { body, headers: { authorization: `Bearer ${OWNER_TOKEN}` } });
    },
  };
  return h;
}

export async function bodyOf<T = Record<string, unknown>>(res: Response): Promise<T> {
  return (await res.json()) as T;
}
