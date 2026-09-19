import { MAIL_TEMPLATE_KEYS, type MailProvider, type MailSendResponse, type MailTemplateData } from "@site/contracts/mail";
import { EMAIL_RE, normalizeEmail } from "@site/contracts/audience";
import type { Env } from "../env.js";
import { errorResponse, json, readJsonObject } from "../http.js";
import { renderMail } from "../templates/index.js";

export function templateOptions(env: Env) {
  return { siteName: env.SITE_NAME ?? "", siteUrl: env.SITE_URL ?? "" };
}

function boundedData(raw: unknown): MailTemplateData | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: MailTemplateData = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = v;
  }
  return out;
}

export async function handleSend(request: Request, env: Env, provider: MailProvider, requestId: string): Promise<Response> {
  const body = await readJsonObject(request);
  if (!body) return errorResponse("bad_request", "Expected a JSON object body", 400, requestId);
  const templateKey = typeof body.templateKey === "string" ? body.templateKey : "";
  const to = typeof body.to === "string" ? normalizeEmail(body.to) : "";
  const data = boundedData(body.templateData);
  const fields: Record<string, string[]> = {};
  if (!(MAIL_TEMPLATE_KEYS as readonly string[]).includes(templateKey)) fields.templateKey = [`one of ${MAIL_TEMPLATE_KEYS.join(", ")}`];
  if (!EMAIL_RE.test(to)) fields.to = ["must be a valid email address"];
  if (!data) fields.templateData = ["must be an object of scalars"];
  if (Object.keys(fields).length > 0) return errorResponse("validation_failed", "Validation failed", 422, requestId, { fields });

  const rendered = renderMail(templateKey, data!, templateOptions(env));
  if (!rendered) return errorResponse("unsupported", `Unknown template: ${templateKey}`, 422, requestId);
  const result = await provider.send({ ...rendered, to });
  const response: MailSendResponse = { ok: result.ok, provider: provider.name, providerMessageId: result.providerMessageId, error: result.error };
  return json(response, result.ok ? 200 : 502);
}
