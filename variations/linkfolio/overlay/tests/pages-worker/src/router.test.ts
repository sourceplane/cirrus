import { route } from "@pages-worker/router";
import type { Env } from "@pages-worker/env";
import type { Deps } from "@pages-worker/deps";
import type { Block, ClickRow, Page, PagesRepository } from "@saas/db/pages";

// ── In-memory repository ─────────────────────────────────────

const NOW = new Date("2026-09-09T12:00:00.000Z");

function fakeRepo(): PagesRepository & { pages: Page[]; blocks: Block[]; clicks: (ClickRow & { userId: string })[] } {
  const pages: Page[] = [];
  const blocks: Block[] = [];
  const clicks: (ClickRow & { userId: string })[] = [];

  const repo: PagesRepository = {
    async getPageByUserId(userId) { return { ok: true, value: pages.find((p) => p.userId === userId) ?? null }; },
    async getPublishedPageByHandle(handle) {
      return { ok: true, value: pages.find((p) => p.handle === handle.toLowerCase() && p.published) ?? null };
    },
    async upsertPage(input) {
      if (pages.some((p) => p.handle === input.handle && p.userId !== input.userId)) {
        return { ok: false, error: { kind: "conflict", entity: "handle" } };
      }
      const existing = pages.find((p) => p.userId === input.userId);
      const page: Page = {
        userId: input.userId,
        handle: input.handle,
        title: input.title,
        bio: input.bio ?? null,
        theme: input.theme ?? {},
        published: input.published ?? false,
        createdAt: existing?.createdAt ?? NOW,
        updatedAt: NOW,
      };
      if (existing) pages.splice(pages.indexOf(existing), 1, page);
      else pages.push(page);
      return { ok: true, value: page };
    },
    async listBlocks(userId) {
      return { ok: true, value: blocks.filter((b) => b.userId === userId).sort((a, b) => a.position - b.position) };
    },
    async listEnabledBlocks(userId) {
      return { ok: true, value: blocks.filter((b) => b.userId === userId && b.enabled).sort((a, b) => a.position - b.position) };
    },
    async getBlock(userId, id) {
      const b = blocks.find((x) => x.userId === userId && x.id === id);
      return b ? { ok: true, value: b } : { ok: false, error: { kind: "not_found" } };
    },
    async createBlock(input) {
      const mine = blocks.filter((b) => b.userId === input.userId);
      const b: Block = {
        id: input.id, userId: input.userId, kind: input.kind, title: input.title,
        url: input.url ?? null, description: input.description ?? null,
        priceCents: input.priceCents ?? null, currency: input.currency ?? null,
        position: mine.length, enabled: true, createdAt: NOW, updatedAt: NOW,
      };
      blocks.push(b);
      return { ok: true, value: b };
    },
    async updateBlock(userId, id, input) {
      const b = blocks.find((x) => x.userId === userId && x.id === id);
      if (!b) return { ok: false, error: { kind: "not_found" } };
      if (input.title !== undefined) b.title = input.title;
      if (input.url !== undefined) b.url = input.url;
      if (input.description !== undefined) b.description = input.description;
      if (input.priceCents !== undefined) b.priceCents = input.priceCents;
      if (input.currency !== undefined) b.currency = input.currency;
      if (input.enabled !== undefined) b.enabled = input.enabled;
      return { ok: true, value: b };
    },
    async deleteBlock(userId, id) {
      const i = blocks.findIndex((x) => x.userId === userId && x.id === id);
      if (i < 0) return { ok: false, error: { kind: "not_found" } };
      blocks.splice(i, 1);
      return { ok: true, value: undefined };
    },
    async reorderBlocks(userId, ids) {
      ids.forEach((id, i) => {
        const b = blocks.find((x) => x.userId === userId && x.id === id);
        if (b) b.position = i;
      });
      return { ok: true, value: blocks.filter((b) => b.userId === userId).sort((a, b) => a.position - b.position) };
    },
    async recordClick(input) {
      clicks.push({ blockId: input.blockId, userId: input.userId, occurredAt: NOW });
      return { ok: true, value: undefined };
    },
    async clicksSince(userId) {
      return { ok: true, value: clicks.filter((c) => c.userId === userId) };
    },
  };
  return Object.assign(repo, { pages, blocks, clicks });
}

let seq = 0;
function deps(repo: PagesRepository): Deps {
  return {
    repo,
    now: () => NOW,
    newId: () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`,
    dispose: async () => {},
  };
}

const env: Env = { ENVIRONMENT: "test" };
const USER_A = "usr_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const USER_B = "usr_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function req(method: string, path: string, opts: { user?: string; body?: unknown } = {}): Request {
  const headers: Record<string, string> = { "content-type": "application/json", "x-request-id": "req_test" };
  if (opts.user) {
    headers["x-actor-subject-id"] = opts.user;
    headers["x-actor-subject-type"] = "user";
  }
  return new Request(`https://pages-worker${path}`, {
    method,
    headers,
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
}

async function json(r: Response): Promise<any> {
  return r.json();
}

async function seedPage(d: Deps, user: string, handle: string, published = true): Promise<void> {
  await route(req("PUT", "/v1/me/page", { user, body: { handle, title: "Jane", published } }), env, d);
}

async function addBlock(d: Deps, user: string, body: Record<string, unknown>): Promise<string> {
  const r = await route(req("POST", "/v1/me/page/blocks", { user, body }), env, d);
  return (await json(r)).data.block.id;
}

// ── Tests ────────────────────────────────────────────────────

describe("pages-worker router", () => {
  it("health needs no actor", async () => {
    expect((await route(req("GET", "/health"), env)).status).toBe(200);
  });

  it("503s without a database when no deps are injected", async () => {
    expect((await route(req("GET", "/v1/p/jane"), env)).status).toBe(503);
  });

  it("owner routes need a user actor", async () => {
    const d = deps(fakeRepo());
    for (const path of ["/v1/me/page", "/v1/me/page/blocks", "/v1/me/page/analytics"]) {
      expect((await route(req("GET", path), env, d)).status).toBe(401);
    }
    expect((await route(req("POST", "/v1/me/page/blocks/reorder", { body: { ids: [] } }), env, d)).status).toBe(401);
  });

  it("upserts the page, normalizing the handle", async () => {
    const d = deps(fakeRepo());
    expect((await json(await route(req("GET", "/v1/me/page", { user: USER_A }), env, d))).data.page).toBeNull();

    const r = await route(req("PUT", "/v1/me/page", { user: USER_A, body: { handle: "  Jane  ", title: "Jane Doe", bio: "hi", published: true } }), env, d);
    expect(r.status).toBe(200);
    expect((await json(r)).data.page).toMatchObject({ handle: "jane", title: "Jane Doe", bio: "hi", published: true });

    const bad = await route(req("PUT", "/v1/me/page", { user: USER_A, body: { handle: "me", title: "" } }), env, d);
    expect(bad.status).toBe(422);
  });

  it("refuses a handle another creator holds, but lets you re-save your own", async () => {
    const d = deps(fakeRepo());
    await seedPage(d, USER_A, "taken");
    const conflict = await route(req("PUT", "/v1/me/page", { user: USER_B, body: { handle: "taken", title: "B" } }), env, d);
    expect(conflict.status).toBe(409);
    expect((await json(conflict)).error.details.field).toBe("handle");
    expect((await route(req("PUT", "/v1/me/page", { user: USER_A, body: { handle: "taken", title: "A2", published: true } }), env, d)).status).toBe(200);
  });

  it("creates, edits, disables and deletes blocks, scoped to the owner", async () => {
    const d = deps(fakeRepo());
    await seedPage(d, USER_A, "jane");
    const id = await addBlock(d, USER_A, { kind: "link", title: "Newsletter", url: "https://news.dev" });
    expect(id).toMatch(/^blk_[0-9a-f]{32}$/);

    expect((await route(req("PATCH", `/v1/me/page/blocks/${id}`, { user: USER_B, body: { title: "Hijacked" } }), env, d)).status).toBe(404);
    expect((await route(req("DELETE", `/v1/me/page/blocks/${id}`, { user: USER_B }), env, d)).status).toBe(404);

    const patched = await route(req("PATCH", `/v1/me/page/blocks/${id}`, { user: USER_A, body: { title: "My newsletter", enabled: false } }), env, d);
    expect(patched.status).toBe(200);
    expect((await json(patched)).data.block).toMatchObject({ title: "My newsletter", enabled: false });

    // A link block cannot lose its URL, and its kind is fixed.
    expect((await route(req("PATCH", `/v1/me/page/blocks/${id}`, { user: USER_A, body: { url: null } }), env, d)).status).toBe(422);
    expect((await route(req("PATCH", `/v1/me/page/blocks/${id}`, { user: USER_A, body: { kind: "tip" } }), env, d)).status).toBe(422);

    expect((await route(req("DELETE", `/v1/me/page/blocks/${id}`, { user: USER_A }), env, d)).status).toBe(204);
    expect((await json(await route(req("GET", "/v1/me/page/blocks", { user: USER_A }), env, d))).data.blocks).toEqual([]);
  });

  it("rejects a create that the kind makes invalid", async () => {
    const d = deps(fakeRepo());
    await seedPage(d, USER_A, "jane");
    expect((await route(req("POST", "/v1/me/page/blocks", { user: USER_A, body: { kind: "link", title: "No URL" } }), env, d)).status).toBe(422);
    expect((await route(req("POST", "/v1/me/page/blocks", { user: USER_A, body: { kind: "chart", title: "X", url: "https://x.dev" } }), env, d)).status).toBe(422);
    expect((await route(req("POST", "/v1/me/page/blocks", { user: USER_A, body: { kind: "header", title: "Section" } }), env, d)).status).toBe(201);
  });

  it("reorders only on a complete permutation of the owner's blocks", async () => {
    const d = deps(fakeRepo());
    await seedPage(d, USER_A, "jane");
    const a = await addBlock(d, USER_A, { kind: "link", title: "A", url: "https://a.dev" });
    const b = await addBlock(d, USER_A, { kind: "link", title: "B", url: "https://b.dev" });

    expect((await route(req("POST", "/v1/me/page/blocks/reorder", { user: USER_A, body: { ids: [a] } }), env, d)).status).toBe(422);
    expect((await route(req("POST", "/v1/me/page/blocks/reorder", { user: USER_A, body: { ids: [a, a] } }), env, d)).status).toBe(422);
    expect((await route(req("POST", "/v1/me/page/blocks/reorder", { user: USER_A, body: { ids: [a, "blk_ffffffffffffffffffffffffffffffff"] } }), env, d)).status).toBe(422);
    expect((await route(req("POST", "/v1/me/page/blocks/reorder", { user: USER_A, body: { ids: ["nonsense", b] } }), env, d)).status).toBe(422);

    const ok = await route(req("POST", "/v1/me/page/blocks/reorder", { user: USER_A, body: { ids: [b, a] } }), env, d);
    expect(ok.status).toBe(200);
    expect((await json(ok)).data.blocks.map((x: any) => x.title)).toEqual(["B", "A"]);
  });

  it("serves a published page publicly, with enabled blocks only and no owner id", async () => {
    const d = deps(fakeRepo());
    await seedPage(d, USER_A, "jane", false);
    const shown = await addBlock(d, USER_A, { kind: "link", title: "Shown", url: "https://shown.dev" });
    const hidden = await addBlock(d, USER_A, { kind: "link", title: "Hidden", url: "https://hidden.dev" });
    await route(req("PATCH", `/v1/me/page/blocks/${hidden}`, { user: USER_A, body: { enabled: false } }), env, d);

    // Unpublished: invisible.
    expect((await route(req("GET", "/v1/p/jane"), env, d)).status).toBe(404);

    await route(req("PUT", "/v1/me/page", { user: USER_A, body: { handle: "jane", title: "Jane", published: true } }), env, d);
    const page = await route(req("GET", "/v1/p/jane"), env, d);
    expect(page.status).toBe(200);
    const body = (await json(page)).data;
    expect(body.blocks.map((b: any) => b.title)).toEqual(["Shown"]);
    expect(JSON.stringify(body)).not.toContain(USER_A);
    expect(body.page.handle).toBe("jane");
    expect(shown).toBeDefined();

    expect((await route(req("GET", "/v1/p/nobody"), env, d)).status).toBe(404);
  });

  it("records an anonymous click and returns the target URL", async () => {
    const repo = fakeRepo();
    const d = deps(repo);
    await seedPage(d, USER_A, "jane");
    const id = await addBlock(d, USER_A, { kind: "link", title: "Newsletter", url: "https://news.dev" });

    const click = await route(req("POST", `/v1/p/jane/blocks/${id}/click`, { body: { referrer: "https://x.com" } }), env, d);
    expect(click.status).toBe(200);
    expect((await json(click)).data.url).toBe("https://news.dev");
    expect(repo.clicks).toHaveLength(1);
    expect(repo.clicks[0]!.userId).toBe(USER_A);

    // A disabled block is not on the page, so it cannot be clicked.
    await route(req("PATCH", `/v1/me/page/blocks/${id}`, { user: USER_A, body: { enabled: false } }), env, d);
    expect((await route(req("POST", `/v1/p/jane/blocks/${id}/click`), env, d)).status).toBe(404);

    // Neither can a header.
    const header = await addBlock(d, USER_A, { kind: "header", title: "Section" });
    expect((await route(req("POST", `/v1/p/jane/blocks/${header}/click`), env, d)).status).toBe(404);
    expect((await route(req("POST", "/v1/p/jane/blocks/blk_ffffffffffffffffffffffffffffffff/click"), env, d)).status).toBe(404);
  });

  it("summarizes clicks over the requested window", async () => {
    const d = deps(fakeRepo());
    await seedPage(d, USER_A, "jane");
    const id = await addBlock(d, USER_A, { kind: "link", title: "Newsletter", url: "https://news.dev" });
    await route(req("POST", `/v1/p/jane/blocks/${id}/click`), env, d);
    await route(req("POST", `/v1/p/jane/blocks/${id}/click`), env, d);

    const stats = await route(req("GET", "/v1/me/page/analytics?days=7", { user: USER_A }), env, d);
    expect(stats.status).toBe(200);
    const body = (await json(stats)).data;
    expect(body).toMatchObject({ days: 7, totalClicks: 2 });
    expect(body.byBlock[0]).toMatchObject({ title: "Newsletter", clicks: 2 });
    expect(body.byDay).toHaveLength(7);

    expect((await route(req("GET", "/v1/me/page/analytics?days=0", { user: USER_A }), env, d)).status).toBe(422);
    expect((await route(req("GET", "/v1/me/page/analytics?days=400", { user: USER_A }), env, d)).status).toBe(422);
  });

  it("unknown routes and wrong methods", async () => {
    const d = deps(fakeRepo());
    expect((await route(req("GET", "/v1/nope"), env, d)).status).toBe(404);
    expect((await route(req("DELETE", "/v1/me/page", { user: USER_A }), env, d)).status).toBe(405);
    expect((await route(req("GET", "/v1/me/page/blocks/reorder", { user: USER_A }), env, d)).status).toBe(405);
    expect((await route(req("PATCH", "/v1/me/page/blocks/not-an-id", { user: USER_A, body: {} }), env, d)).status).toBe(404);
    expect((await route(req("PUT", "/v1/p/jane"), env, d)).status).toBe(405);
  });
});
