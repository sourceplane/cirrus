import { EMAIL_RE, normalizeEmail } from "@site/contracts/audience";
import type { ConfirmSubscriptionResponse, SubscribeResponse, UnsubscribeResponse } from "@site/contracts/audience";
import { newId, ID_PREFIX } from "@site/shared/ids";
import type { RequestContext } from "../context.js";
import { randomToken, sha256Hex } from "../crypto.js";
import { errorResponse, json, readJsonObject, validationError } from "../http.js";
import { hashConfirmToken, mintUnsubscribeToken, verifyUnsubscribeToken } from "../tokens.js";
import { verifyTurnstile } from "../turnstile.js";

const SOURCE_RE = /^[a-z0-9][a-z0-9/_-]{0,79}$/;
const TAG_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const MAIL_THROTTLE_SECONDS = 600;

function apiBase(ctx: RequestContext, request: Request): string {
  return new URL(request.url).origin;
}

export async function handleSubscribe(ctx: RequestContext, request: Request): Promise<Response> {
  const body = await readJsonObject(request);
  if (!body) return errorResponse("bad_request", "Expected a JSON object body", 400, ctx.requestId);

  const fields: Record<string, string[]> = {};
  const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
  if (!EMAIL_RE.test(email)) fields.email = ["must be a valid email address"];
  const source = typeof body.source === "string" ? body.source.trim().toLowerCase() : null;
  if (source !== null && !SOURCE_RE.test(source)) fields.source = ["invalid source"];
  let tags: string[] = [];
  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags) || body.tags.length > 10 || !body.tags.every((t) => typeof t === "string" && TAG_RE.test(t))) {
      fields.tags = ["up to 10 lowercase tags"];
    } else {
      tags = [...new Set(body.tags as string[])];
    }
  }
  if (Object.keys(fields).length > 0) return validationError(ctx.requestId, fields);

  const turnstile = await verifyTurnstile(ctx.env, body.turnstileToken, request.headers.get("cf-connecting-ip"));
  if (!turnstile.ok) return errorResponse("forbidden", "Challenge failed", 403, ctx.requestId, { turnstile: turnstile.reason });

  const plaintext = randomToken();
  const confirmTokenHash = await hashConfirmToken(plaintext);
  const result = await ctx.timings.measure("db", () =>
    ctx.audience.upsertPending({
      id: newId(ID_PREFIX.subscriber),
      email,
      source,
      tags,
      confirmTokenHash,
      now: ctx.now.toISOString(),
    }),
  );
  if (!result.ok) return errorResponse("internal_error", "Could not record subscription", 500, ctx.requestId);

  const response: SubscribeResponse = { status: result.value.needsConfirmation ? "pending" : "confirmed" };
  if (result.value.needsConfirmation && (await shouldMail(ctx, email))) {
    const confirmUrl = `${apiBase(ctx, request)}/v1/subscribers/confirm?token=${plaintext}&redirect=1`;
    await ctx.timings.measure("mail", () =>
      ctx.mail.send(
        {
          templateKey: "subscribe.confirm",
          to: email,
          templateData: { siteName: ctx.env.SITE_NAME ?? "", siteUrl: ctx.env.SITE_URL ?? "", confirmUrl },
        },
        ctx.requestId,
      ),
    );
  }
  return json(response, 202);
}

/** One confirmation mail per address per 10 minutes, via KV; fail-open. */
async function shouldMail(ctx: RequestContext, email: string): Promise<boolean> {
  const kv = ctx.env.RATE_LIMIT_KV;
  if (!kv) return true;
  const key = `mail:confirm:${(await sha256Hex(email)).slice(0, 32)}`;
  try {
    if (await kv.get(key)) return false;
    await kv.put(key, "1", { expirationTtl: MAIL_THROTTLE_SECONDS });
  } catch {
    return true;
  }
  return true;
}

export async function handleConfirm(ctx: RequestContext, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const redirect = url.searchParams.get("redirect") === "1" && Boolean(ctx.env.SITE_URL);
  const outcome = /^[0-9a-f]{64}$/.test(token)
    ? await ctx.timings.measure("db", async () => ctx.audience.confirmByToken(await hashConfirmToken(token), ctx.now.toISOString()))
    : ({ ok: false, error: { kind: "not_found" } } as const);

  if (!outcome.ok) {
    if (redirect) return Response.redirect(`${ctx.env.SITE_URL}/confirm?status=invalid`, 302);
    return errorResponse("not_found", "This confirmation link is invalid or was already used", 404, ctx.requestId);
  }

  if (ctx.env.TOKEN_SECRET) {
    const unsubscribeToken = await mintUnsubscribeToken(ctx.env.TOKEN_SECRET, outcome.value.id);
    await ctx.timings.measure("mail", () =>
      ctx.mail.send(
        {
          templateKey: "subscribe.welcome",
          to: outcome.value.email,
          templateData: {
            siteName: ctx.env.SITE_NAME ?? "",
            siteUrl: ctx.env.SITE_URL ?? "",
            unsubscribeUrl: `${new URL(request.url).origin}/v1/subscribers/unsubscribe?token=${unsubscribeToken}&redirect=1`,
          },
        },
        ctx.requestId,
      ),
    );
  }

  if (redirect) return Response.redirect(`${ctx.env.SITE_URL}/confirm?status=ok`, 302);
  const body: ConfirmSubscriptionResponse = { status: "confirmed", email: outcome.value.email };
  return json(body);
}

export async function handleUnsubscribe(ctx: RequestContext, request: Request): Promise<Response> {
  const url = new URL(request.url);
  let token = url.searchParams.get("token") ?? "";
  const redirect = url.searchParams.get("redirect") === "1" && Boolean(ctx.env.SITE_URL);
  if (request.method === "POST") {
    const body = await readJsonObject(request);
    if (body && typeof body.token === "string") token = body.token;
  }
  if (!ctx.env.TOKEN_SECRET) {
    return errorResponse("precondition_failed", "Unsubscribe links are not configured on this deployment", 503, ctx.requestId);
  }
  const id = token ? await verifyUnsubscribeToken(ctx.env.TOKEN_SECRET, token) : null;
  const outcome = id
    ? await ctx.timings.measure("db", () => ctx.audience.unsubscribeById(id, ctx.now.toISOString()))
    : ({ ok: false, error: { kind: "not_found" } } as const);
  if (!outcome.ok) {
    if (redirect) return Response.redirect(`${ctx.env.SITE_URL}/unsubscribe?status=invalid`, 302);
    return errorResponse("not_found", "This unsubscribe link is invalid", 404, ctx.requestId);
  }
  if (redirect) return Response.redirect(`${ctx.env.SITE_URL}/unsubscribe?status=ok`, 302);
  const body: UnsubscribeResponse = { status: "unsubscribed" };
  return json(body);
}
