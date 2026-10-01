/* eslint-disable no-console -- the suite swaps console.log to capture the debug provider */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createSqlExecutor } from "@site/db/d1";
import { createAudienceRepository } from "@site/db/audience";
import { createNewsletterRepository } from "@site/db/newsletter";
import { testId } from "@site/testing/ids";
import { testDatabase } from "@site/testing/sqlite";
import { verifyUnsubscribeToken } from "@site/shared/tokens";
import type { Env } from "@mail-worker/env";
import { route } from "@mail-worker/router";
import { runBroadcast, MAX_BATCHES_PER_RUN } from "@mail-worker/handlers/broadcast";
import { createLocalDebugProvider } from "@mail-worker/providers/local-debug";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_ROOT = resolve(__dirname, "../../..", "packages/db/src/migrations");
const T = "2026-03-04T05:06:07.000Z";

function setup(overrides: Partial<Env> = {}) {
  const { db, binding } = testDatabase(MIGRATIONS_ROOT);
  const env: Env = {
    SITE_DB: binding as unknown as D1Database,
    ENVIRONMENT: "test",
    MAIL_PROVIDER: "local-debug",
    SITE_NAME: "Virga",
    SITE_URL: "https://site.test",
    SITE_API_URL: "https://api.test/",
    TOKEN_SECRET: "secret",
    ...overrides,
  };
  const executor = createSqlExecutor(binding);
  return { db, env, executor, audience: createAudienceRepository(executor), newsletter: createNewsletterRepository(executor) };
}

async function seed(s: ReturnType<typeof setup>, confirmed: number, pending = 1) {
  for (let i = 0; i < confirmed + pending; i++) {
    await s.audience.upsertPending({ id: testId("sub", `s${i}`), email: `s${i}@example.com`, source: null, tags: [], confirmTokenHash: `h${i}`, now: T });
    if (i < confirmed) await s.audience.confirmByToken(`h${i}`, T);
  }
  const issueId = testId("iss", "1");
  await s.newsletter.createIssue({ id: issueId, slug: "one", subject: "Issue one", html: "<p>Hello</p>", text: "Hello", now: T });
  return issueId;
}

const call = (env: Env, path: string, body?: unknown, method = "POST") =>
  route(new Request(`https://mail.internal${path}`, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : null }), env);

describe("mail-worker", () => {
  it("health and send through the router", async () => {
    const s = setup();
    const logged: string[] = [];
    const originalLog = console.log;
    console.log = (line: string) => { logged.push(line); };
    const health = await call(s.env, "/health", undefined, "GET");
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ status: "ok", service: "mail-worker", checks: { provider: "local-debug" } });
    const sent = await call(s.env, "/v1/mail/send", { templateKey: "subscribe.confirm", to: "A@Example.com", templateData: { confirmUrl: "https://x/c" } });
    expect(sent.status).toBe(200);
    expect(await sent.json()).toMatchObject({ ok: true, provider: "local-debug" });
    expect(logged.some((l) => l.includes('"to":"a@example.com"'))).toBe(true);
    const bad = await call(s.env, "/v1/mail/send", { templateKey: "nope", to: "x", templateData: [] });
    expect(bad.status).toBe(422);
    expect(((await bad.json()) as { error: { details: { fields: Record<string, unknown> } } }).error.details.fields).toHaveProperty("templateKey");
    expect((await call(s.env, "/v1/nothing")).status).toBe(404);
    console.log = originalLog;
  });

  it("broadcasts to confirmed subscribers with per-recipient unsubscribe links, marking deliveries", async () => {
    const s = setup();
    const issueId = await seed(s, 3);
    const provider = createLocalDebugProvider(false);
    const report = await runBroadcast({ newsletter: s.newsletter, provider, env: s.env, now: () => new Date(T) }, issueId, 2);
    expect(report).toEqual({ issueId, status: "sent", queued: 0, sent: 3, failed: 0, skipped: 0 });
    expect(provider.sent.map((m) => m.to).sort()).toEqual(["s0@example.com", "s1@example.com", "s2@example.com"]);
    const first = provider.sent[0]!;
    expect(first.subject).toBe("Issue one");
    expect(first.html).toContain("<p>Hello</p>");
    expect(first.html).toContain("unsubscribe?token=");
    const token = /Unsubscribe: https:\/\/api\.test\/v1\/subscribers\/unsubscribe\?token=([^&\s]+)&redirect=1/.exec(first.text)![1]!;
    const subscriberId = await verifyUnsubscribeToken("secret", token);
    const row = s.db.prepare("SELECT id FROM audience_subscribers WHERE email = ?").get(first.to) as { id: string };
    expect(subscriberId).toBe(row.id);
    const issue = s.db.prepare("SELECT status, sent_at FROM newsletter_issues").get() as { status: string; sent_at: string };
    expect(issue).toEqual({ status: "sent", sent_at: T });
    // Sending again is a conflict.
    const again = await runBroadcast({ newsletter: s.newsletter, provider, env: s.env, now: () => new Date(T) }, issueId, 2);
    expect(again).toEqual({ error: "already_sent", status: 409 });
  });

  it("records failures, resumes only queued rows, and never sends twice", async () => {
    const s = setup();
    const issueId = await seed(s, 3);
    const attempts: string[] = [];
    let failFor: string | null = "s1@example.com";
    const provider = {
      name: "flaky",
      async send(m: { to: string }) {
        attempts.push(m.to);
        if (m.to === failFor) return { ok: false, providerMessageId: null, error: "boom" };
        return { ok: true, providerMessageId: `id-${m.to}`, error: null };
      },
    };
    const deps = { newsletter: s.newsletter, provider, env: s.env, now: () => new Date(T) };
    const first = await runBroadcast(deps, issueId, 10);
    expect(first).toMatchObject({ status: "sent", sent: 2, failed: 1, queued: 0 });
    expect(attempts).toHaveLength(3);
    const failed = s.db.prepare("SELECT error, provider_message_id FROM newsletter_deliveries WHERE status = 'failed'").get() as { error: string; provider_message_id: null };
    expect(failed).toEqual({ error: "boom", provider_message_id: null });

    // A run that stops part-way (batch budget) resumes from the queued rows only.
    const s2 = setup();
    const issue2 = await seed(s2, MAX_BATCHES_PER_RUN * 2 + 3);
    failFor = null;
    const p2 = createLocalDebugProvider(false);
    const deps2 = { newsletter: s2.newsletter, provider: p2, env: s2.env, now: () => new Date(T) };
    const partial = await runBroadcast(deps2, issue2, 2);
    expect(partial).toMatchObject({ status: "sending", sent: MAX_BATCHES_PER_RUN * 2, queued: 3 });
    const rest = await runBroadcast(deps2, issue2, 2);
    expect(rest).toMatchObject({ status: "sent", sent: MAX_BATCHES_PER_RUN * 2 + 3, queued: 0 });
    expect(new Set(p2.sent.map((m) => m.to)).size).toBe(p2.sent.length);
  });

  it("the broadcast route validates and reports", async () => {
    const s = setup();
    const issueId = await seed(s, 1);
    expect((await call(s.env, "/v1/mail/broadcast", { issueId: "nope" })).status).toBe(422);
    expect((await call(s.env, "/v1/mail/broadcast", { issueId: testId("iss", "missing") })).status).toBe(404);
    const originalLog = console.log;
    console.log = () => undefined;
    const ok = await call(s.env, "/v1/mail/broadcast", { issueId, batchSize: 1 });
    expect(ok.status).toBe(202);
    expect(await ok.json()).toMatchObject({ issueId, status: "sent", sent: 1 });
    expect((await call(s.env, "/v1/mail/broadcast", { issueId })).status).toBe(409);
    console.log = originalLog;
  });
});
