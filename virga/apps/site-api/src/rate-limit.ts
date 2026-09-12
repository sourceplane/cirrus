// Per-fingerprint token buckets (carried from Cirrus's edge limiter, without
// the org scope and the Durable Object tier).
//
// Mutating routes pay a durable KV read-modify-write; last-writer-wins
// under concurrency is accepted for a site of this shape. Public reads use a
// colo-local in-isolate bucket with no I/O. Both fail OPEN: a KV outage
// admits the request without headers and logs a warning — abuse control
// must never take the site down.

import type { Env } from "./env.js";

export type RouteFamily = "subscribe" | "tokens" | "forms" | "reactions" | "views" | "owner" | "reads";

interface BucketLimits {
  limit: number;
  windowSec: number;
}

export const LIMITS: Record<RouteFamily, BucketLimits> = {
  subscribe: { limit: 5, windowSec: 600 },
  tokens: { limit: 20, windowSec: 600 },
  forms: { limit: 5, windowSec: 600 },
  reactions: { limit: 60, windowSec: 60 },
  views: { limit: 120, windowSec: 60 },
  owner: { limit: 120, windowSec: 60 },
  reads: { limit: 300, windowSec: 60 },
};

const KV_PREFIX = "rl:v1";
const KV_TTL_SECONDS = 1200;
const MEM_CAP = 10_000;

export interface BucketState {
  t: number;
  r: number;
}

export interface Decision {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetEpoch: number;
  retryAfterSec: number;
}

/** Pure token-bucket step — the one place the refill/consume math lives. */
export function tokenBucketStep(prev: BucketState | null, limits: BucketLimits, now: number): { next: BucketState } & Decision {
  const refillRate = limits.limit / limits.windowSec;
  const base = prev ?? { t: limits.limit, r: now };
  const refilled = Math.min(limits.limit, base.t + Math.max(0, now - base.r) * refillRate);
  if (refilled >= 1) {
    const tokens = refilled - 1;
    return {
      next: { t: tokens, r: now },
      allowed: true,
      limit: limits.limit,
      remaining: Math.floor(tokens),
      resetEpoch: Math.ceil(now + (limits.limit - tokens) / refillRate),
      retryAfterSec: 0,
    };
  }
  return {
    next: { t: refilled, r: now },
    allowed: false,
    limit: limits.limit,
    remaining: 0,
    resetEpoch: Math.ceil(now + (limits.limit - refilled) / refillRate),
    retryAfterSec: Math.max(1, Math.ceil((1 - refilled) / refillRate)),
  };
}

const memBuckets = new Map<string, BucketState>();

export type RateLimitResult =
  | { kind: "allowed"; headers: Record<string, string> }
  | { kind: "denied"; response: Response };

export async function enforceRateLimit(
  env: Env,
  family: RouteFamily,
  key: string,
  requestId: string,
  durable: boolean,
  now = Date.now() / 1000,
): Promise<RateLimitResult> {
  const limits = LIMITS[family];
  const bucketKey = `${KV_PREFIX}:${family}:${key}`;
  let decision: Decision;

  if (durable) {
    const kv = env.RATE_LIMIT_KV;
    if (!kv) return { kind: "allowed", headers: {} };
    try {
      const raw = await kv.get(bucketKey, "text");
      const step = tokenBucketStep(parseState(raw), limits, now);
      await kv.put(bucketKey, JSON.stringify(step.next), { expirationTtl: KV_TTL_SECONDS });
      decision = step;
    } catch (err) {
      console.warn(JSON.stringify({ level: "warn", msg: "rate_limit.backend_failure", requestId, error: String(err) }));
      return { kind: "allowed", headers: {} };
    }
  } else {
    if (!memBuckets.has(bucketKey) && memBuckets.size >= MEM_CAP) memBuckets.clear();
    const step = tokenBucketStep(memBuckets.get(bucketKey) ?? null, limits, now);
    memBuckets.set(bucketKey, step.next);
    decision = step;
  }

  const headers = {
    "x-ratelimit-limit": String(decision.limit),
    "x-ratelimit-remaining": String(decision.remaining),
    "x-ratelimit-reset": String(decision.resetEpoch),
  };
  if (decision.allowed) return { kind: "allowed", headers };

  const retry = Math.max(1, decision.retryAfterSec);
  return {
    kind: "denied",
    response: Response.json(
      {
        error: {
          code: "rate_limited",
          message: `Rate limit exceeded. Retry after ${retry} seconds.`,
          details: { family, retryAfterSeconds: retry },
          requestId,
        },
      },
      { status: 429, headers: { ...headers, "content-type": "application/json", "retry-after": String(retry) } },
    ),
  };
}

function parseState(raw: string | null): BucketState | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && typeof (parsed as BucketState).t === "number" && typeof (parsed as BucketState).r === "number") {
      return { t: (parsed as BucketState).t, r: (parsed as BucketState).r };
    }
  } catch {
    // fall through
  }
  return null;
}

/** Test-only: clear the in-isolate read buckets between cases. */
export function __resetRateLimitMemoryForTest(): void {
  memBuckets.clear();
}
