import { SUBSCRIBER_STATUSES } from "@site/contracts/audience";
import type { Subscriber, SubscriberStatus } from "@site/contracts/audience";
import { FORM_KEY_RE, SUBMISSION_STATUSES } from "@site/contracts/forms";
import type { Submission, SubmissionStatus } from "@site/contracts/forms";
import type { Issue, IssueSendReport } from "@site/contracts/newsletter";
import { OWNER_PAGE_LIMIT } from "@site/contracts/owner";
import type { Page, SiteStats } from "@site/contracts/owner";
import { newId, ID_PREFIX, isPublicId } from "@site/shared/ids";
import type { RequestContext } from "../context.js";
import { errorResponse, json, readJsonObject, validationError } from "../http.js";

const ISSUE_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;

function pageParams(url: URL): { cursor: string | null; limit: number } {
  const limitRaw = Number(url.searchParams.get("limit") ?? OWNER_PAGE_LIMIT.default);
  const limit = Number.isFinite(limitRaw) ? Math.min(OWNER_PAGE_LIMIT.max, Math.max(1, Math.floor(limitRaw))) : OWNER_PAGE_LIMIT.default;
  return { cursor: url.searchParams.get("cursor"), limit };
}

export async function handleListSubscribers(ctx: RequestContext, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  if (status !== null && !SUBSCRIBER_STATUSES.includes(status as SubscriberStatus)) {
    return validationError(ctx.requestId, { status: [`one of ${SUBSCRIBER_STATUSES.join(", ")}`] });
  }
  const { cursor, limit } = pageParams(url);
  const result = await ctx.timings.measure("db", () =>
    ctx.audience.list({ status: (status as SubscriberStatus | null) ?? undefined, cursor, limit }),
  );
  if (!result.ok) return errorResponse("internal_error", "Could not list subscribers", 500, ctx.requestId);
  const body: Page<Subscriber> = result.value;
  return json(body);
}

function csvCell(value: string | null): string {
  if (value === null) return "";
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export async function handleExportSubscribers(ctx: RequestContext, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  if (status !== null && !SUBSCRIBER_STATUSES.includes(status as SubscriberStatus)) {
    return validationError(ctx.requestId, { status: [`one of ${SUBSCRIBER_STATUSES.join(", ")}`] });
  }
  const lines = ["email,status,source,tags,created_at,confirmed_at"];
  let cursor: string | null = null;
  // Page through everything; bounded by the page size cap, not by memory of a
  // single row set — the export is the owner's, not a visitor's.
  for (let guard = 0; guard < 10_000; guard++) {
    const page = await ctx.audience.list({ status: (status as SubscriberStatus | null) ?? undefined, cursor, limit: OWNER_PAGE_LIMIT.max });
    if (!page.ok) return errorResponse("internal_error", "Could not export subscribers", 500, ctx.requestId);
    for (const s of page.value.items) {
      lines.push([s.email, s.status, s.source, s.tags.join(" "), s.createdAt, s.confirmedAt].map(csvCell).join(","));
    }
    cursor = page.value.nextCursor;
    if (!cursor) break;
  }
  return new Response(`${lines.join("\n")}\n`, {
    status: 200,
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="subscribers.csv"' },
  });
}

export async function handleListSubmissions(ctx: RequestContext, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const form = url.searchParams.get("form");
  const status = url.searchParams.get("status");
  const errors: Record<string, string[]> = {};
  if (form !== null && !FORM_KEY_RE.test(form)) errors.form = ["invalid form key"];
  if (status !== null && !SUBMISSION_STATUSES.includes(status as SubmissionStatus)) errors.status = [`one of ${SUBMISSION_STATUSES.join(", ")}`];
  if (Object.keys(errors).length > 0) return validationError(ctx.requestId, errors);
  const { cursor, limit } = pageParams(url);
  const result = await ctx.timings.measure("db", () =>
    ctx.forms.list({ form: form ?? undefined, status: (status as SubmissionStatus | null) ?? undefined, cursor, limit }),
  );
  if (!result.ok) return errorResponse("internal_error", "Could not list submissions", 500, ctx.requestId);
  const body: Page<Submission> = result.value;
  return json(body);
}

export async function handleUpdateSubmission(ctx: RequestContext, request: Request, id: string): Promise<Response> {
  if (!isPublicId(id, ID_PREFIX.submission)) return errorResponse("not_found", "Unknown submission", 404, ctx.requestId);
  const body = await readJsonObject(request);
  const status = body?.status;
  if (typeof status !== "string" || !SUBMISSION_STATUSES.includes(status as SubmissionStatus)) {
    return validationError(ctx.requestId, { status: [`one of ${SUBMISSION_STATUSES.join(", ")}`] });
  }
  const result = await ctx.timings.measure("db", () =>
    ctx.forms.updateStatus(id, status as SubmissionStatus, ctx.now.toISOString()),
  );
  if (!result.ok) {
    if (result.error.kind === "not_found") return errorResponse("not_found", "Unknown submission", 404, ctx.requestId);
    return errorResponse("internal_error", "Could not update submission", 500, ctx.requestId);
  }
  const updated: Submission = result.value;
  return json(updated);
}

export async function handleListIssues(ctx: RequestContext, request: Request): Promise<Response> {
  const { cursor, limit } = pageParams(new URL(request.url));
  const result = await ctx.timings.measure("db", () => ctx.newsletter.listIssues({ cursor, limit }));
  if (!result.ok) return errorResponse("internal_error", "Could not list issues", 500, ctx.requestId);
  const body: Page<Issue> = result.value;
  return json(body);
}

/** The entities the issue templates emit, decoded in ONE pass (see below). */
const HTML_ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};

/**
 * A plain-text alternative derived from HTML when the owner gave none.
 *
 * Two things here are deliberate, and both were bugs before:
 *
 * 1. **Tags are stripped to a fixed point.** One pass is not enough: removing
 *    the inner tag of `<scr<b>ipt>` leaves `<script>` behind, so the output of
 *    a single `replace` can contain markup the pass was meant to remove.
 *    Repeating until the string stops changing terminates (every replacement
 *    shortens it) and leaves nothing tag-shaped.
 *
 * 2. **Entities are decoded in ONE pass.** Chained replaces feed each other:
 *    `&amp;lt;` becomes `&lt;` under the first and then `<` under the second,
 *    so text the author escaped ON PURPOSE — `&amp;lt;b&amp;gt;`, meaning the
 *    reader should see the characters `<b>` — silently turned into markup. A
 *    single regex with a lookup consumes each entity exactly once, so a
 *    decoded `&` is never re-scanned.
 */
export function htmlToText(html: string): string {
  let text = html.replace(/<\s*(br|\/p|\/div|\/h[1-6]|\/li|\/tr)\s*>/gi, "\n");
  let previous: string;
  do {
    previous = text;
    text = text.replace(/<[^>]*>/g, "");
  } while (text !== previous);

  text = text.replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g, (entity) => HTML_ENTITIES[entity] ?? entity);

  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function handleCreateIssue(ctx: RequestContext, request: Request): Promise<Response> {
  const body = await readJsonObject(request);
  if (!body) return errorResponse("bad_request", "Expected a JSON object body", 400, ctx.requestId);
  const errors: Record<string, string[]> = {};
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  if (!ISSUE_SLUG_RE.test(slug)) errors.slug = ["lowercase letters, digits and dashes"];
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  if (subject.length < 1 || subject.length > 200) errors.subject = ["1..200 characters"];
  const html = typeof body.html === "string" ? body.html : "";
  if (html.length < 1 || html.length > 500_000) errors.html = ["1..500000 characters"];
  const text = typeof body.text === "string" && body.text.length > 0 ? body.text : htmlToText(html);
  if (Object.keys(errors).length > 0) return validationError(ctx.requestId, errors);

  const result = await ctx.timings.measure("db", () =>
    ctx.newsletter.createIssue({ id: newId(ID_PREFIX.issue), slug, subject, html, text, now: ctx.now.toISOString() }),
  );
  if (!result.ok) {
    if (result.error.kind === "conflict") return errorResponse("conflict", `An issue with slug "${slug}" exists`, 409, ctx.requestId);
    return errorResponse("internal_error", "Could not create issue", 500, ctx.requestId);
  }
  const created: Issue = result.value;
  return json(created, 201);
}

export async function handleGetIssue(ctx: RequestContext, id: string): Promise<Response> {
  if (!isPublicId(id, ID_PREFIX.issue)) return errorResponse("not_found", "Unknown issue", 404, ctx.requestId);
  const issue = await ctx.newsletter.findIssueById(id);
  if (!issue.ok) return errorResponse("not_found", "Unknown issue", 404, ctx.requestId);
  const counts = await ctx.newsletter.deliveryCounts(id);
  return json({ ...issue.value, deliveries: counts.ok ? counts.value : null });
}

export async function handleSendIssue(ctx: RequestContext, id: string): Promise<Response> {
  if (!isPublicId(id, ID_PREFIX.issue)) return errorResponse("not_found", "Unknown issue", 404, ctx.requestId);
  const issue = await ctx.newsletter.findIssueById(id);
  if (!issue.ok) return errorResponse("not_found", "Unknown issue", 404, ctx.requestId);
  if (issue.value.status === "sent") return errorResponse("conflict", "Issue already sent", 409, ctx.requestId);
  const report = await ctx.timings.measure("mail", () => ctx.mail.broadcast({ issueId: id }, ctx.requestId));
  if ("error" in report) {
    return errorResponse("precondition_failed", "Broadcast failed", 503, ctx.requestId, { reason: report.error });
  }
  const body: IssueSendReport = report;
  return json(body, 202);
}

export async function handleStats(ctx: RequestContext): Promise<Response> {
  const [subs, forms, engagement, issues] = await ctx.timings.measure("db", () =>
    Promise.all([
      ctx.audience.countByStatus(),
      ctx.forms.counts(),
      ctx.engagement.totals(ctx.today),
      ctx.newsletter.countIssues(),
    ]),
  );
  if (!subs.ok || !forms.ok || !engagement.ok || !issues.ok) {
    return errorResponse("internal_error", "Could not compute stats", 500, ctx.requestId);
  }
  const body: SiteStats = {
    subscribers: subs.value,
    submissions: forms.value,
    views: engagement.value.views,
    reactions: { upvotes: engagement.value.reactions.upvote, likes: engagement.value.reactions.like },
    issues: issues.value,
    generatedAt: ctx.now.toISOString(),
  };
  return json(body);
}
