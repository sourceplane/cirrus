import { createEngagementRepository, rankScore, daysBefore } from "@site/db/engagement";
import { testId } from "@site/testing/ids";
import { executorOverFreshDatabase, T0 } from "./helpers";

const TODAY = "2026-01-10";

describe("engagement repository (real SQLite)", () => {
  it("toggles a reaction on and off and keeps the totals in step", async () => {
    const { executor, db } = executorOverFreshDatabase();
    const repo = createEngagementRepository(executor);
    const on = await repo.toggleReaction({ id: testId("rxn", "1"), slug: "launches/acme", kind: "upvote", visitor: "v1", now: T0 });
    expect(on.ok && on.value).toEqual({ slug: "launches/acme", counts: { upvote: 1, like: 0 }, viewer: { upvote: true, like: false } });
    const other = await repo.toggleReaction({ id: testId("rxn", "2"), slug: "launches/acme", kind: "upvote", visitor: "v2", now: T0 });
    expect(other.ok && other.value.counts.upvote).toBe(2);
    const off = await repo.toggleReaction({ id: testId("rxn", "3"), slug: "launches/acme", kind: "upvote", visitor: "v1", now: T0 });
    expect(off.ok && off.value).toEqual({ slug: "launches/acme", counts: { upvote: 1, like: 0 }, viewer: { upvote: false, like: false } });
    const rows = db.prepare("SELECT COUNT(*) AS n FROM engagement_reactions").get() as { n: number };
    expect(rows.n).toBe(1);
    const anon = await repo.reactionSummary("launches/acme", null);
    expect(anon.ok && anon.value.viewer).toEqual({ upvote: false, like: false });
    const unknown = await repo.reactionSummary("nothing/here", "v1");
    expect(unknown.ok && unknown.value.counts).toEqual({ upvote: 0, like: 0 });
  });

  it("counts views per day and sums the last seven", async () => {
    const { executor } = executorOverFreshDatabase();
    const repo = createEngagementRepository(executor);
    for (let i = 0; i < 3; i++) await repo.recordView("posts/hello", TODAY);
    await repo.recordView("posts/hello", daysBefore(TODAY, 6));
    await repo.recordView("posts/hello", daysBefore(TODAY, 7));
    await repo.recordView("posts/hello", "2025-12-01");
    const s = await repo.viewSummary("posts/hello", TODAY);
    expect(s.ok && s.value).toEqual({ slug: "posts/hello", total: 6, last7Days: 4 });
    const none = await repo.viewSummary("posts/none", TODAY);
    expect(none.ok && none.value).toEqual({ slug: "posts/none", total: 0, last7Days: 0 });
  });

  it("ranks slugs under a prefix by upvotes, then views", async () => {
    const { executor } = executorOverFreshDatabase();
    const repo = createEngagementRepository(executor);
    const react = (slug: string, visitor: string, at = T0) =>
      repo.toggleReaction({ id: testId("rxn", `${slug}-${visitor}`), slug, kind: "upvote", visitor, now: at });
    await react("launches/a", "v1");
    await react("launches/a", "v2");
    await react("launches/b", "v1");
    await react("posts/not-a-launch", "v1");
    for (let i = 0; i < 1000; i++) await repo.recordView("launches/c", TODAY);
    await repo.recordView("launches/b", TODAY);
    const top = await repo.top({ prefix: "launches/", today: TODAY });
    expect(top.ok && top.value.map((r) => r.slug)).toEqual(["launches/a", "launches/b", "launches/c"]);
    expect(top.ok && top.value[0]).toEqual({ slug: "launches/a", upvotes: 2, views: 0, score: rankScore(2, 0) });
    expect(top.ok && top.value[2]?.score).toBeCloseTo(3.0, 2);
    const limited = await repo.top({ prefix: "launches/", today: TODAY, limit: 1 });
    expect(limited.ok && limited.value.length).toBe(1);
  });

  it("applies a reaction window when asked", async () => {
    const { executor } = executorOverFreshDatabase();
    const repo = createEngagementRepository(executor);
    await repo.toggleReaction({ id: testId("rxn", "old"), slug: "launches/old", kind: "upvote", visitor: "v1", now: "2025-06-01T00:00:00.000Z" });
    await repo.toggleReaction({ id: testId("rxn", "new"), slug: "launches/new", kind: "upvote", visitor: "v1", now: `${TODAY}T10:00:00.000Z` });
    const all = await repo.top({ prefix: "launches/", today: TODAY });
    expect(all.ok && all.value.map((r) => r.slug).sort()).toEqual(["launches/new", "launches/old"]);
    const week = await repo.top({ prefix: "launches/", today: TODAY, windowDays: 7 });
    expect(week.ok && week.value.map((r) => r.slug)).toEqual(["launches/new"]);
  });

  it("reports site-wide totals", async () => {
    const { executor } = executorOverFreshDatabase();
    const repo = createEngagementRepository(executor);
    await repo.toggleReaction({ id: testId("rxn", "1"), slug: "a", kind: "upvote", visitor: "v1", now: T0 });
    await repo.toggleReaction({ id: testId("rxn", "2"), slug: "a", kind: "like", visitor: "v1", now: T0 });
    await repo.recordView("a", TODAY);
    await repo.recordView("b", "2025-01-01");
    const t = await repo.totals(TODAY);
    expect(t.ok && t.value).toEqual({ reactions: { upvote: 1, like: 1 }, views: { total: 2, last7Days: 1 } });
  });
});
