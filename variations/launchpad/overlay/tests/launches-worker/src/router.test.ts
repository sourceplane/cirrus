import { route } from "@launches-worker/router";
import type { Env } from "@launches-worker/env";
import type { Deps } from "@launches-worker/deps";
import type { LaunchesRepository, Maker, Product, Comment } from "@saas/db/launches";
import { slugify, validateProductFields, validateProfile, normalizeTags } from "@launches-worker/validation";

// ── In-memory repository ─────────────────────────────────────

function fakeRepo(): LaunchesRepository & { products: Product[]; makers: Maker[]; votes: Set<string>; comments: Comment[] } {
  const products: Product[] = [];
  const makers: Maker[] = [];
  const votes = new Set<string>();
  const comments: Comment[] = [];
  const now = () => new Date("2026-09-09T12:00:00.000Z");
  const repo: LaunchesRepository = {
    async getMakerByUserId(userId) { return { ok: true, value: makers.find((m) => m.userId === userId) ?? null }; },
    async getMakerByHandle(handle) { return { ok: true, value: makers.find((m) => m.handle === handle) ?? null }; },
    async upsertMaker(input) {
      const existing = makers.find((m) => m.userId === input.userId);
      if (makers.some((m) => m.handle === input.handle && m.userId !== input.userId)) return { ok: false, error: { kind: "conflict", entity: "handle" } };
      const m: Maker = { userId: input.userId, handle: input.handle, displayName: input.displayName, bio: input.bio ?? null, websiteUrl: input.websiteUrl ?? null, twitter: input.twitter ?? null, createdAt: existing?.createdAt ?? now(), updatedAt: now() };
      if (existing) makers.splice(makers.indexOf(existing), 1, m); else makers.push(m);
      return { ok: true, value: m };
    },
    async createProduct(input) {
      if (products.some((p) => p.slug === input.slug)) return { ok: false, error: { kind: "conflict", entity: "slug" } };
      const p: Product = { id: input.id, userId: input.userId, slug: input.slug, name: input.name, tagline: input.tagline, description: input.description ?? "", url: input.url, tags: input.tags ?? [], status: "draft", launchedAt: null, upvoteCount: 0, commentCount: 0, createdAt: now(), updatedAt: now() };
      products.push(p);
      return { ok: true, value: p };
    },
    async listProductsByUser(userId) { return { ok: true, value: products.filter((p) => p.userId === userId) }; },
    async getProductForUser(userId, id) { const p = products.find((x) => x.userId === userId && x.id === id); return p ? { ok: true, value: p } : { ok: false, error: { kind: "not_found" } }; },
    async updateProduct(userId, id, input) {
      const p = products.find((x) => x.userId === userId && x.id === id);
      if (!p) return { ok: false, error: { kind: "not_found" } };
      Object.assign(p, input);
      if (input.status === "draft") p.launchedAt = null;
      return { ok: true, value: p };
    },
    async launchProduct(userId, id, at) {
      const p = products.find((x) => x.userId === userId && x.id === id);
      if (!p) return { ok: false, error: { kind: "not_found" } };
      p.status = "live"; p.launchedAt = p.launchedAt ?? at;
      return { ok: true, value: p };
    },
    async deleteProduct(userId, id) {
      const i = products.findIndex((x) => x.userId === userId && x.id === id);
      if (i < 0) return { ok: false, error: { kind: "not_found" } };
      products.splice(i, 1);
      return { ok: true, value: undefined };
    },
    async feed(q) {
      const live = products.filter((p) => p.status === "live").sort((a, b) => b.upvoteCount - a.upvoteCount);
      return { ok: true, value: live.slice(0, q.limit) };
    },
    async getLiveProductBySlug(slug) { return { ok: true, value: products.find((p) => p.slug === slug && p.status === "live") ?? null }; },
    async listLiveProductsByUser(userId) { return { ok: true, value: products.filter((p) => p.userId === userId && p.status === "live") }; },
    async upvote(productId, userId) {
      const p = products.find((x) => x.id === productId)!;
      const key = `${productId}:${userId}`;
      const changed = !votes.has(key);
      if (changed) { votes.add(key); p.upvoteCount++; }
      return { ok: true, value: { upvoteCount: p.upvoteCount, changed } };
    },
    async removeUpvote(productId, userId) {
      const p = products.find((x) => x.id === productId)!;
      const key = `${productId}:${userId}`;
      const changed = votes.has(key);
      if (changed) { votes.delete(key); p.upvoteCount--; }
      return { ok: true, value: { upvoteCount: p.upvoteCount, changed } };
    },
    async hasUpvoted(userId, ids) { return { ok: true, value: new Set(ids.filter((id) => votes.has(`${id}:${userId}`))) }; },
    async addComment(input) {
      const c: Comment = { id: input.id, productId: input.productId, userId: input.userId, body: input.body, createdAt: now() };
      comments.push(c);
      products.find((p) => p.id === input.productId)!.commentCount++;
      return { ok: true, value: c };
    },
    async listComments(productId) { return { ok: true, value: comments.filter((c) => c.productId === productId) }; },
  };
  return Object.assign(repo, { products, makers, votes, comments });
}

let seq = 0;
function deps(repo: LaunchesRepository): Deps {
  return {
    repo,
    now: () => new Date("2026-09-09T12:00:00.000Z"),
    newId: () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`,
    dispose: async () => {},
  };
}

const env: Env = { ENVIRONMENT: "test" };
const USER_A = "usr_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const USER_B = "usr_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function req(method: string, path: string, opts: { user?: string; body?: unknown } = {}): Request {
  const headers: Record<string, string> = { "content-type": "application/json", "x-request-id": "req_test" };
  if (opts.user) { headers["x-actor-subject-id"] = opts.user; headers["x-actor-subject-type"] = "user"; }
  return new Request(`https://launches-worker${path}`, { method, headers, ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}) });
}

async function json(r: Response): Promise<any> { return r.json(); }

// ── Tests ────────────────────────────────────────────────────

describe("launches-worker validation", () => {
  it("slugifies names", () => {
    expect(slugify("  Hello, World! v2 ")).toBe("hello-world-v2");
    expect(slugify("Ünïcode ✨")).toBe("unicode");
  });
  it("normalizes tags (dedupe, cap at 5)", () => {
    expect(normalizeTags(["AI", "ai", " Dev Tools "])).toEqual(["ai", "dev-tools"]);
    expect(normalizeTags(["a", "b", "c", "d", "e", "f"])).toBeNull();
    expect(normalizeTags("nope")).toBeNull();
  });
  it("rejects a bad product", () => {
    const r = validateProductFields({ name: "x", tagline: "y", url: "ftp://z" }, false);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.fields).sort()).toEqual(["name", "tagline", "url"]);
  });
  it("rejects reserved and malformed handles", () => {
    expect(validateProfile({ handle: "me", displayName: "X" }).ok).toBe(false);
    expect(validateProfile({ handle: "Jo", displayName: "X" }).ok).toBe(false);
    const ok = validateProfile({ handle: "Jane_Doe", displayName: "Jane", twitter: "@jane" });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value).toMatchObject({ handle: "jane_doe", twitter: "jane" });
  });
});

describe("launches-worker router", () => {
  it("health needs no actor", async () => {
    const r = await route(req("GET", "/health"), env);
    expect(r.status).toBe(200);
  });

  it("owner routes need a user actor", async () => {
    const d = deps(fakeRepo());
    expect((await route(req("GET", "/v1/me/products"), env, d)).status).toBe(401);
    expect((await route(req("GET", "/v1/me/profile"), env, d)).status).toBe(401);
    expect((await route(req("PUT", "/v1/launches/x/upvote"), env, d)).status).toBe(401);
  });

  it("creates a draft, refuses to launch without a profile, launches after one exists", async () => {
    const repo = fakeRepo();
    const d = deps(repo);
    const created = await route(req("POST", "/v1/me/products", { user: USER_A, body: { name: "Acme Notes", tagline: "Notes that sync", url: "https://acme.dev", tags: ["Productivity"] } }), env, d);
    expect(created.status).toBe(201);
    const { data } = await json(created);
    expect(data.product.slug).toBe("acme-notes");
    expect(data.product.status).toBe("draft");
    expect(data.product.tags).toEqual(["productivity"]);
    expect(data.product.id).toMatch(/^lp_[0-9a-f]{32}$/);

    const launch1 = await route(req("POST", `/v1/me/products/${data.product.id}/launch`, { user: USER_A }), env, d);
    expect(launch1.status).toBe(412);

    const profile = await route(req("PUT", "/v1/me/profile", { user: USER_A, body: { handle: "acme", displayName: "Acme" } }), env, d);
    expect(profile.status).toBe(200);

    const launch2 = await route(req("POST", `/v1/me/products/${data.product.id}/launch`, { user: USER_A }), env, d);
    expect(launch2.status).toBe(200);
    const live = (await json(launch2)).data.product;
    expect(live.status).toBe("live");
    expect(live.launchedAt).toBe("2026-09-09T12:00:00.000Z");
    expect(live.maker.handle).toBe("acme");
  });

  it("rejects a duplicate slug with 409", async () => {
    const d = deps(fakeRepo());
    const body = { name: "Same", tagline: "Same tagline", url: "https://same.dev" };
    expect((await route(req("POST", "/v1/me/products", { user: USER_A, body }), env, d)).status).toBe(201);
    const dup = await route(req("POST", "/v1/me/products", { user: USER_B, body }), env, d);
    expect(dup.status).toBe(409);
  });

  it("scopes owner reads to the actor", async () => {
    const d = deps(fakeRepo());
    const c = await route(req("POST", "/v1/me/products", { user: USER_A, body: { name: "Mine", tagline: "Only mine", url: "https://m.dev" } }), env, d);
    const id = (await json(c)).data.product.id;
    expect((await route(req("GET", `/v1/me/products/${id}`, { user: USER_A }), env, d)).status).toBe(200);
    expect((await route(req("GET", `/v1/me/products/${id}`, { user: USER_B }), env, d)).status).toBe(404);
    expect((await route(req("DELETE", `/v1/me/products/${id}`, { user: USER_B }), env, d)).status).toBe(404);
    expect((await route(req("DELETE", `/v1/me/products/${id}`, { user: USER_A }), env, d)).status).toBe(204);
  });

  it("public feed lists live products only, and marks the viewer's upvotes", async () => {
    const repo = fakeRepo();
    const d = deps(repo);
    await route(req("PUT", "/v1/me/profile", { user: USER_A, body: { handle: "maker-a", displayName: "A" } }), env, d);
    const c1 = await route(req("POST", "/v1/me/products", { user: USER_A, body: { name: "Live One", tagline: "It is live", url: "https://one.dev" } }), env, d);
    const id1 = (await json(c1)).data.product.id;
    await route(req("POST", "/v1/me/products", { user: USER_A, body: { name: "Draft Two", tagline: "Still a draft", url: "https://two.dev" } }), env, d);
    await route(req("POST", `/v1/me/products/${id1}/launch`, { user: USER_A }), env, d);

    const anon = await route(req("GET", "/v1/launches?range=today"), env, d);
    expect(anon.status).toBe(200);
    const feed = (await json(anon)).data;
    expect(feed.range).toBe("today");
    expect(feed.products.map((p: any) => p.slug)).toEqual(["live-one"]);
    expect(feed.products[0].viewerHasUpvoted).toBe(false);
    expect(feed.products[0].maker.handle).toBe("maker-a");

    const up = await route(req("PUT", "/v1/launches/live-one/upvote", { user: USER_B }), env, d);
    expect((await json(up)).data).toEqual({ upvoteCount: 1, viewerHasUpvoted: true });
    // Idempotent: a second vote by the same user does not double count.
    const up2 = await route(req("PUT", "/v1/launches/live-one/upvote", { user: USER_B }), env, d);
    expect((await json(up2)).data.upvoteCount).toBe(1);

    const asB = await route(req("GET", "/v1/launches/live-one", { user: USER_B }), env, d);
    expect((await json(asB)).data.product.viewerHasUpvoted).toBe(true);

    const down = await route(req("DELETE", "/v1/launches/live-one/upvote", { user: USER_B }), env, d);
    expect((await json(down)).data.upvoteCount).toBe(0);

    expect((await route(req("GET", "/v1/launches?range=nope"), env, d)).status).toBe(422);
    expect((await route(req("GET", "/v1/launches/draft-two"), env, d)).status).toBe(404);
  });

  it("comments: public read, authenticated write, counted on the product", async () => {
    const d = deps(fakeRepo());
    await route(req("PUT", "/v1/me/profile", { user: USER_A, body: { handle: "maker-a", displayName: "A" } }), env, d);
    const c = await route(req("POST", "/v1/me/products", { user: USER_A, body: { name: "Chatty", tagline: "Has comments", url: "https://c.dev" } }), env, d);
    const id = (await json(c)).data.product.id;
    await route(req("POST", `/v1/me/products/${id}/launch`, { user: USER_A }), env, d);

    expect((await route(req("POST", "/v1/launches/chatty/comments", { body: { body: "hi" } }), env, d)).status).toBe(401);
    expect((await route(req("POST", "/v1/launches/chatty/comments", { user: USER_B, body: { body: "   " } }), env, d)).status).toBe(422);
    const added = await route(req("POST", "/v1/launches/chatty/comments", { user: USER_B, body: { body: "Congrats!" } }), env, d);
    expect(added.status).toBe(201);
    expect((await json(added)).data.comment.author).toBeNull(); // B has no maker profile

    const list = await route(req("GET", "/v1/launches/chatty/comments"), env, d);
    expect((await json(list)).data.comments).toHaveLength(1);
    const product = await route(req("GET", "/v1/launches/chatty"), env, d);
    expect((await json(product)).data.product.commentCount).toBe(1);
  });

  it("maker page: profile + live products; handle conflicts are 409", async () => {
    const d = deps(fakeRepo());
    expect((await route(req("PUT", "/v1/me/profile", { user: USER_A, body: { handle: "taken", displayName: "A" } }), env, d)).status).toBe(200);
    expect((await route(req("PUT", "/v1/me/profile", { user: USER_B, body: { handle: "taken", displayName: "B" } }), env, d)).status).toBe(409);
    // Re-saving your own handle is fine.
    expect((await route(req("PUT", "/v1/me/profile", { user: USER_A, body: { handle: "taken", displayName: "A2", bio: "hello" } }), env, d)).status).toBe(200);

    const page = await route(req("GET", "/v1/makers/taken"), env, d);
    expect(page.status).toBe(200);
    const body = (await json(page)).data;
    expect(body.maker.displayName).toBe("A2");
    expect(body.products).toEqual([]);
    expect((await route(req("GET", "/v1/makers/nobody"), env, d)).status).toBe(404);
  });

  it("unknown routes and wrong methods", async () => {
    const d = deps(fakeRepo());
    expect((await route(req("GET", "/v1/nope"), env, d)).status).toBe(404);
    expect((await route(req("DELETE", "/v1/launches", { user: USER_A }), env, d)).status).toBe(405);
    expect((await route(req("GET", "/v1/me/products/not-an-id", { user: USER_A }), env, d)).status).toBe(404);
  });

  it("503s without a database when no deps are injected", async () => {
    const r = await route(req("GET", "/v1/launches"), env);
    expect(r.status).toBe(503);
  });
});
