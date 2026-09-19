// Cloudflare Turnstile verification, optional: without TURNSTILE_SECRET every
// request passes. With it, a missing or failed token is a 403. A verification
// call that itself fails (network) admits the request and logs — fail-open,
// like the rate limiter.

import type { Env } from "./env.js";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileOutcome = { ok: true } | { ok: false; reason: string };

export async function verifyTurnstile(
  env: Env,
  token: unknown,
  remoteIp: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<TurnstileOutcome> {
  const secret = env.TURNSTILE_SECRET;
  if (!secret) return { ok: true };
  if (typeof token !== "string" || token.length === 0) return { ok: false, reason: "missing" };
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp) body.set("remoteip", remoteIp);
    const res = await fetchImpl(VERIFY_URL, { method: "POST", body });
    const data = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
    if (data.success) return { ok: true };
    return { ok: false, reason: (data["error-codes"] ?? ["failed"]).join(",") };
  } catch (err) {
    console.warn(JSON.stringify({ level: "warn", msg: "turnstile.verify_failure", error: String(err) }));
    return { ok: true };
  }
}
