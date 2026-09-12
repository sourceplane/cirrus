import { FORM_KEY_RE, FORM_LIMITS } from "@site/contracts/forms";
import type { FormSubmitResponse } from "@site/contracts/forms";
import { newId, ID_PREFIX } from "@site/shared/ids";
import type { RequestContext } from "../context.js";
import { errorResponse, json, readJsonObject, validationError } from "../http.js";
import { verifyTurnstile } from "../turnstile.js";

const FIELD_KEY_RE = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

export async function handleFormSubmit(ctx: RequestContext, request: Request, form: string): Promise<Response> {
  if (!FORM_KEY_RE.test(form)) return errorResponse("not_found", `Unknown form: ${form}`, 404, ctx.requestId);
  const body = await readJsonObject(request);
  if (!body) return errorResponse("bad_request", "Expected a JSON object body", 400, ctx.requestId);

  // A filled honeypot is a bot: accept (so it learns nothing) and drop.
  if (typeof body.honeypot === "string" && body.honeypot.length > 0) {
    const decoy: FormSubmitResponse = { id: newId(ID_PREFIX.submission), status: "accepted" };
    return json(decoy, 202);
  }

  const raw = body.fields;
  const errors: Record<string, string[]> = {};
  const fields: Record<string, string> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    errors.fields = ["must be an object of string values"];
  } else {
    const entries = Object.entries(raw as Record<string, unknown>);
    if (entries.length === 0) errors.fields = ["must not be empty"];
    if (entries.length > FORM_LIMITS.maxFields) errors.fields = [`at most ${FORM_LIMITS.maxFields} fields`];
    for (const [key, value] of entries) {
      if (key.length > FORM_LIMITS.maxKeyLength || !FIELD_KEY_RE.test(key)) {
        errors[key] = ["invalid field name"];
      } else if (typeof value !== "string") {
        errors[key] = ["must be a string"];
      } else if (value.length > FORM_LIMITS.maxValueLength) {
        errors[key] = [`at most ${FORM_LIMITS.maxValueLength} characters`];
      } else {
        fields[key] = value;
      }
    }
  }
  if (Object.keys(errors).length > 0) return validationError(ctx.requestId, errors);

  const turnstile = await verifyTurnstile(ctx.env, body.turnstileToken, request.headers.get("cf-connecting-ip"));
  if (!turnstile.ok) return errorResponse("forbidden", "Challenge failed", 403, ctx.requestId, { turnstile: turnstile.reason });

  const created = await ctx.timings.measure("db", () =>
    ctx.forms.create({ id: newId(ID_PREFIX.submission), form, fields, visitor: ctx.visitor, now: ctx.now.toISOString() }),
  );
  if (!created.ok) return errorResponse("internal_error", "Could not record submission", 500, ctx.requestId);

  if (ctx.env.OWNER_EMAIL) {
    const summary = Object.entries(fields)
      .map(([k, v]) => `${k}: ${v.length > 500 ? `${v.slice(0, 500)}…` : v}`)
      .join("\n");
    await ctx.timings.measure("mail", () =>
      ctx.mail.send(
        {
          templateKey: "form.receipt",
          to: ctx.env.OWNER_EMAIL!,
          templateData: { siteName: ctx.env.SITE_NAME ?? "", form, submissionId: created.value.id, summary },
        },
        ctx.requestId,
      ),
    );
  }

  const response: FormSubmitResponse = { id: created.value.id, status: "accepted" };
  return json(response, 202);
}
