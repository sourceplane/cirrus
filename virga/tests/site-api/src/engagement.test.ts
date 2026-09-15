import { harness, bodyOf } from "./harness";

describe("site-api: reactions, views, rankings", () => {
  it("toggles an upvote per visitor and reports viewer state", async () => {
    const h = harness();
    const on = await h.call("POST", "/v1/reactions/launches/acme", { body: { kind: "upvote" } });
    expect(on.status).toBe(200);
    expect(await bodyOf(on)).toEqual({ slug: "launches/acme", counts: { upvote: 1, like: 0 }, viewer: { upvote: true, like: false } });
    const other = await h.call("POST", "/v1/reactions/launches/acme", { body: { kind: "upvote" }, ip: "198.51.100.9" });
    expect((await bodyOf<{ counts: { upvote: number } }>(other)).counts.upvote).toBe(2);
    const off = await h.call("POST", "/v1/reactions/launches/acme", { body: { kind: "upvote" } });
    expect(await bodyOf(off)).toEqual({ slug: "launches/acme", counts: { upvote: 1, like: 0 }, viewer: { upvote: false, like: false } });
    const read = await h.call("GET", "/v1/reactions/launches/acme", { ip: "198.51.100.9" });
    expect((await bodyOf<{ viewer: { upvote: boolean } }>(read)).viewer.upvote).toBe(true);
    expect((await h.call("POST", "/v1/reactions/launches/acme", { body: { kind: "star" } })).status).toBe(422);
    expect((await h.call("GET", "/v1/reactions/BAD%20SLUG")).status).toBe(404);
  });

  it("the fingerprint rotates with the day", async () => {
    const h = harness();
    await h.call("POST", "/v1/reactions/posts/a", { body: { kind: "like" } });
    h.now = new Date("2026-03-05T05:06:07.000Z");
    const tomorrow = await h.call("GET", "/v1/reactions/posts/a");
    expect(await bodyOf(tomorrow)).toMatchObject({ counts: { like: 1 }, viewer: { like: false } });
  });

  it("counts views and ranks launches", async () => {
    const h = harness();
    for (let i = 0; i < 3; i++) expect((await h.call("POST", "/v1/views/launches/a")).status).toBe(204);
    await h.call("POST", "/v1/views/launches/b");
    await h.call("POST", "/v1/reactions/launches/b", { body: { kind: "upvote" } });
    await h.call("POST", "/v1/reactions/posts/x", { body: { kind: "upvote" } });
    const views = await h.call("GET", "/v1/views/launches/a");
    expect(await bodyOf(views)).toEqual({ slug: "launches/a", total: 3, last7Days: 3 });
    expect(views.headers.get("cache-control")).toContain("max-age");
    const top = await h.call("GET", "/v1/launches/top");
    const ranked = await bodyOf<Array<{ slug: string }>>(top);
    expect(ranked.map((r) => r.slug)).toEqual(["launches/b", "launches/a"]);
    const posts = await h.call("GET", "/v1/launches/top?prefix=posts/&limit=5&windowDays=7");
    expect((await bodyOf<Array<{ slug: string }>>(posts)).map((r) => r.slug)).toEqual(["posts/x"]);
    expect((await h.call("GET", "/v1/launches/top?limit=0")).status).toBe(422);
  });
});
