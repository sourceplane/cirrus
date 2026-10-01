import type { MailProvider } from "@site/contracts/mail";
import type { IssueSendReport, IssueStatus } from "@site/contracts/newsletter";
import { createSqlExecutor } from "@site/db/d1";
import { createNewsletterRepository, type NewsletterRepository } from "@site/db/newsletter";
import { ID_PREFIX, isPublicId } from "@site/shared/ids";
import { mintUnsubscribeToken } from "@site/shared/tokens";
import type { Env } from "../env.js";
import { errorResponse, json, readJsonObject } from "../http.js";
import { renderMail } from "../templates/index.js";
import { templateOptions } from "./send.js";

export const DEFAULT_BATCH = 50;
/** Batches worked per invocation; a bigger list resumes on the next call. */
export const MAX_BATCHES_PER_RUN = 20;

export interface BroadcastDeps {
  newsletter: NewsletterRepository;
  provider: MailProvider;
  env: Env;
  now: () => Date;
}

/**
 * Send an issue to every confirmed subscriber, resumably: queue the
 * deliveries that do not exist yet, then work the queued rows in batches,
 * marking each sent or failed. Re-running touches only rows still queued.
 */
export async function runBroadcast(deps: BroadcastDeps, issueId: string, batchSize: number): Promise<IssueSendReport | { error: string; status: number }> {
  const { newsletter, provider, env } = deps;
  const issue = await newsletter.findIssueById(issueId);
  if (!issue.ok) return { error: "not_found", status: 404 };
  if (issue.value.status === "sent") return { error: "already_sent", status: 409 };

  const queued = await newsletter.enqueueDeliveries(issueId);
  if (!queued.ok) return { error: "enqueue_failed", status: 500 };
  if (issue.value.status !== "sending") await newsletter.markIssueStatus(issueId, "sending", deps.now().toISOString());

  const opts = templateOptions(env);
  const apiBase = (env.SITE_API_URL ?? "").replace(/\/$/, "");
  for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch++) {
    const next = await newsletter.nextQueuedDeliveries(issueId, batchSize);
    if (!next.ok) return { error: "read_failed", status: 500 };
    if (next.value.length === 0) break;
    for (const delivery of next.value) {
      const unsubscribeUrl =
        env.TOKEN_SECRET && apiBase
          ? `${apiBase}/v1/subscribers/unsubscribe?token=${await mintUnsubscribeToken(env.TOKEN_SECRET, delivery.subscriberId)}&redirect=1`
          : "";
      const rendered = renderMail(
        "issue.broadcast",
        { siteName: opts.siteName, subject: issue.value.subject, html: issue.value.html, text: issue.value.text, unsubscribeUrl },
        opts,
      )!;
      const result = await provider.send({ ...rendered, to: delivery.email });
      await newsletter.markDelivery({
        id: delivery.id,
        status: result.ok ? "sent" : "failed",
        providerMessageId: result.providerMessageId,
        error: result.error,
        attemptedAt: deps.now().toISOString(),
      });
    }
  }

  const counts = await newsletter.deliveryCounts(issueId);
  if (!counts.ok) return { error: "count_failed", status: 500 };
  let status: IssueStatus = "sending";
  if (counts.value.queued === 0) {
    const marked = await newsletter.markIssueStatus(issueId, "sent", deps.now().toISOString());
    status = marked.ok ? marked.value.status : "sending";
  }
  return { issueId, status, ...counts.value };
}

export async function handleBroadcast(request: Request, env: Env, provider: MailProvider, requestId: string): Promise<Response> {
  const body = await readJsonObject(request);
  if (!body) return errorResponse("bad_request", "Expected a JSON object body", 400, requestId);
  const issueId = typeof body.issueId === "string" ? body.issueId : "";
  if (!isPublicId(issueId, ID_PREFIX.issue)) return errorResponse("validation_failed", "Validation failed", 422, requestId, { fields: { issueId: ["issue id"] } });
  const batchRaw = typeof body.batchSize === "number" ? Math.floor(body.batchSize) : DEFAULT_BATCH;
  const batchSize = Math.min(200, Math.max(1, batchRaw));
  if (!env.SITE_DB) return errorResponse("precondition_failed", "SITE_DB is not configured", 503, requestId);

  const newsletter = createNewsletterRepository(createSqlExecutor(env.SITE_DB));
  const report = await runBroadcast({ newsletter, provider, env, now: () => new Date() }, issueId, batchSize);
  if ("error" in report) return errorResponse(report.error === "not_found" ? "not_found" : report.error === "already_sent" ? "conflict" : "internal_error", report.error, report.status, requestId);
  return json(report, 202);
}
