import { createAudienceRepository } from "@site/db/audience";
import { createNewsletterRepository } from "@site/db/newsletter";
import { testId } from "@site/testing/ids";
import { executorOverFreshDatabase, T0, T1, T2 } from "./helpers";

async function seedSubscribers(executor: ReturnType<typeof executorOverFreshDatabase>["executor"]) {
  const audience = createAudienceRepository(executor);
  for (const [i, status] of (["confirmed", "confirmed", "pending", "unsubscribed"] as const).entries()) {
    const id = testId("sub", `s${i}`);
    await audience.upsertPending({ id, email: `s${i}@example.com`, source: null, tags: [], confirmTokenHash: `h${i}`, now: T0 });
    if (status !== "pending") await audience.confirmByToken(`h${i}`, T1);
    if (status === "unsubscribed") await audience.unsubscribeById(id, T2);
  }
}

describe("newsletter repository (real SQLite)", () => {
  it("creates issues with unique slugs and lists them", async () => {
    const { executor } = executorOverFreshDatabase();
    const repo = createNewsletterRepository(executor);
    const made = await repo.createIssue({ id: testId("iss", "1"), slug: "issue-1", subject: "One", html: "<p>1</p>", text: "1", now: T0 });
    expect(made.ok && made.value).toMatchObject({ slug: "issue-1", status: "draft", sentAt: null });
    const dup = await repo.createIssue({ id: testId("iss", "2"), slug: "issue-1", subject: "Dup", html: "", text: "", now: T1 });
    expect(!dup.ok && dup.error).toEqual({ kind: "conflict", entity: "issue" });
    await repo.createIssue({ id: testId("iss", "3"), slug: "issue-3", subject: "Three", html: "", text: "", now: T2 });
    const list = await repo.listIssues({});
    expect(list.ok && list.value.items.map((i) => i.slug)).toEqual(["issue-3", "issue-1"]);
    expect((await repo.findIssueBySlug("issue-3")).ok).toBe(true);
    expect((await repo.findIssueById(testId("iss", "nope"))).ok).toBe(false);
  });

  it("queues one delivery per confirmed subscriber, resumably", async () => {
    const { executor } = executorOverFreshDatabase();
    await seedSubscribers(executor);
    const repo = createNewsletterRepository(executor);
    const issueId = testId("iss", "1");
    await repo.createIssue({ id: issueId, slug: "issue-1", subject: "One", html: "<p>1</p>", text: "1", now: T0 });

    const queued = await repo.enqueueDeliveries(issueId);
    expect(queued.ok && queued.value).toBe(2);
    const again = await repo.enqueueDeliveries(issueId);
    expect(again.ok && again.value).toBe(0);

    const batch = await repo.nextQueuedDeliveries(issueId, 1);
    expect(batch.ok && batch.value.length).toBe(1);
    const first = batch.ok ? batch.value[0]! : null;
    expect(first?.email).toMatch(/^s[01]@example\.com$/);
    expect(first?.id).toMatch(/^dlv_[0-9a-f]{32}$/);

    const sent = await repo.markDelivery({ id: first!.id, status: "sent", providerMessageId: "msg-1", error: null, attemptedAt: T1 });
    expect(sent.ok && sent.value).toMatchObject({ status: "sent", providerMessageId: "msg-1" });

    const rest = await repo.nextQueuedDeliveries(issueId, 10);
    expect(rest.ok && rest.value.length).toBe(1);
    await repo.markDelivery({ id: rest.ok ? rest.value[0]!.id : "", status: "failed", providerMessageId: null, error: "boom", attemptedAt: T2 });

    const counts = await repo.deliveryCounts(issueId);
    expect(counts.ok && counts.value).toEqual({ queued: 0, sent: 1, failed: 1, skipped: 0 });

    const done = await repo.markIssueStatus(issueId, "sent", T2);
    expect(done.ok && done.value).toMatchObject({ status: "sent", sentAt: T2 });
    const totals = await repo.countIssues();
    expect(totals.ok && totals.value).toEqual({ sent: 1, drafts: 0 });
  });

  it("refuses a delivery for an unknown issue (foreign key)", async () => {
    const { executor } = executorOverFreshDatabase();
    const repo = createNewsletterRepository(executor);
    const r = await executor
      .execute(`INSERT INTO newsletter_deliveries (id, issue_id, subscriber_id) VALUES ('dlv_x', 'iss_missing', 'sub_x')`)
      .then(() => "inserted")
      .catch((err: unknown) => String(err));
    expect(r).toMatch(/FOREIGN KEY constraint failed/);
    expect((await repo.deliveryCounts("iss_missing")).ok).toBe(true);
  });
});
