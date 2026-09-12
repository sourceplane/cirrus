import { createAudienceRepository } from "@site/db/audience";
import { testId } from "@site/testing/ids";
import { executorOverFreshDatabase, T0, T1, T2 } from "./helpers";

const hash = (s: string) => `hash-${s}`;

describe("audience repository (real SQLite)", () => {
  it("inserts a brand-new address as pending and asks for a confirmation", async () => {
    const { executor } = executorOverFreshDatabase();
    const repo = createAudienceRepository(executor);
    const out = await repo.upsertPending({
      id: testId("sub", "a"), email: "a@example.com", source: "home", tags: ["beta"],
      confirmTokenHash: hash("t1"), now: T0,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.value.previousStatus).toBeNull();
    expect(out.value.needsConfirmation).toBe(true);
    expect(out.value.subscriber).toMatchObject({
      email: "a@example.com", status: "pending", source: "home", tags: ["beta"], createdAt: T0,
    });
  });

  it("re-subscribing a pending address rotates the token and re-mails", async () => {
    const { executor, db } = executorOverFreshDatabase();
    const repo = createAudienceRepository(executor);
    await repo.upsertPending({ id: testId("sub", "a"), email: "a@example.com", source: null, tags: [], confirmTokenHash: hash("t1"), now: T0 });
    const again = await repo.upsertPending({ id: testId("sub", "other"), email: "a@example.com", source: "footer", tags: [], confirmTokenHash: hash("t2"), now: T1 });
    expect(again.ok && again.value.previousStatus).toBe("pending");
    expect(again.ok && again.value.needsConfirmation).toBe(true);
    expect(again.ok && again.value.subscriber.id).toBe(testId("sub", "a"));
    const row = db.prepare("SELECT confirm_token_hash, source FROM audience_subscribers").get() as { confirm_token_hash: string; source: string };
    expect(row.confirm_token_hash).toBe(hash("t2"));
    expect(row.source).toBe("footer");
    expect((await repo.confirmByToken(hash("t1"), T2)).ok).toBe(false);
  });

  it("confirms by token exactly once and clears the token", async () => {
    const { executor } = executorOverFreshDatabase();
    const repo = createAudienceRepository(executor);
    await repo.upsertPending({ id: testId("sub", "a"), email: "a@example.com", source: null, tags: [], confirmTokenHash: hash("t1"), now: T0 });
    const confirmed = await repo.confirmByToken(hash("t1"), T1);
    expect(confirmed.ok && confirmed.value).toMatchObject({ status: "confirmed", confirmedAt: T1 });
    const twice = await repo.confirmByToken(hash("t1"), T2);
    expect(twice.ok).toBe(false);
    expect(!twice.ok && twice.error.kind).toBe("not_found");
  });

  it("subscribing a confirmed address is a no-op that needs no mail", async () => {
    const { executor } = executorOverFreshDatabase();
    const repo = createAudienceRepository(executor);
    await repo.upsertPending({ id: testId("sub", "a"), email: "a@example.com", source: null, tags: [], confirmTokenHash: hash("t1"), now: T0 });
    await repo.confirmByToken(hash("t1"), T1);
    const again = await repo.upsertPending({ id: testId("sub", "x"), email: "a@example.com", source: null, tags: [], confirmTokenHash: hash("t9"), now: T2 });
    expect(again.ok && again.value).toMatchObject({ previousStatus: "confirmed", needsConfirmation: false });
    expect(again.ok && again.value.subscriber.status).toBe("confirmed");
  });

  it("unsubscribes by id, and revives an unsubscribed address as pending", async () => {
    const { executor } = executorOverFreshDatabase();
    const repo = createAudienceRepository(executor);
    const id = testId("sub", "a");
    await repo.upsertPending({ id, email: "a@example.com", source: null, tags: [], confirmTokenHash: hash("t1"), now: T0 });
    await repo.confirmByToken(hash("t1"), T1);
    const gone = await repo.unsubscribeById(id, T2);
    expect(gone.ok && gone.value).toMatchObject({ status: "unsubscribed", unsubscribedAt: T2 });
    // Idempotent for the visitor.
    const goneAgain = await repo.unsubscribeById(id, T2);
    expect(goneAgain.ok && goneAgain.value.status).toBe("unsubscribed");
    expect((await repo.unsubscribeById(testId("sub", "nope"), T2)).ok).toBe(false);
    const revived = await repo.upsertPending({ id: testId("sub", "x"), email: "a@example.com", source: null, tags: [], confirmTokenHash: hash("t3"), now: T2 });
    expect(revived.ok && revived.value).toMatchObject({ previousStatus: "unsubscribed", needsConfirmation: true });
    expect(revived.ok && revived.value.subscriber).toMatchObject({ status: "pending", unsubscribedAt: null });
  });

  it("lists newest-first with a keyset cursor and counts by status", async () => {
    const { executor } = executorOverFreshDatabase();
    const repo = createAudienceRepository(executor);
    for (let i = 0; i < 5; i++) {
      await repo.upsertPending({
        id: testId("sub", `s${i}`), email: `s${i}@example.com`, source: null, tags: [],
        confirmTokenHash: hash(`t${i}`), now: `2026-01-0${i + 1}T00:00:00.000Z`,
      });
    }
    await repo.confirmByToken(hash("t4"), T2);
    const page1 = await repo.list({ limit: 2 });
    expect(page1.ok && page1.value.items.map((s) => s.email)).toEqual(["s4@example.com", "s3@example.com"]);
    expect(page1.ok && page1.value.nextCursor).not.toBeNull();
    const page2 = await repo.list({ limit: 2, cursor: page1.ok ? page1.value.nextCursor : null });
    expect(page2.ok && page2.value.items.map((s) => s.email)).toEqual(["s2@example.com", "s1@example.com"]);
    const page3 = await repo.list({ limit: 2, cursor: page2.ok ? page2.value.nextCursor : null });
    expect(page3.ok && page3.value.items.map((s) => s.email)).toEqual(["s0@example.com"]);
    expect(page3.ok && page3.value.nextCursor).toBeNull();
    const confirmedOnly = await repo.list({ status: "confirmed" });
    expect(confirmedOnly.ok && confirmedOnly.value.items.map((s) => s.email)).toEqual(["s4@example.com"]);
    const counts = await repo.countByStatus();
    expect(counts.ok && counts.value).toEqual({ pending: 4, confirmed: 1, unsubscribed: 0 });
    // A garbage cursor is the first page, not an error.
    const garbage = await repo.list({ limit: 10, cursor: "not-a-cursor" });
    expect(garbage.ok && garbage.value.items.length).toBe(5);
  });
});
