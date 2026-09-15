import { runCli, EXIT, type CliDeps } from "@site/cli";

interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
}

function fakeApi(routes: Record<string, (call: Call) => Response | Promise<Response>>) {
  const calls: Call[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const call: Call = {
      method: init?.method ?? "GET",
      url,
      headers: Object.fromEntries(Object.entries((init?.headers as Record<string, string>) ?? {})),
      body: typeof init?.body === "string" ? init.body : null,
    };
    calls.push(call);
    const key = `${call.method} ${new URL(url).pathname}`;
    const handler = routes[key];
    if (!handler) return Response.json({ error: { code: "not_found", message: `no route ${key}`, details: {}, requestId: "r" } }, { status: 404 });
    return handler(call);
  };
  return { calls, fetch: fetchImpl };
}

function run(argv: string[], fetchImpl: typeof fetch, env: Record<string, string> = { VIRGA_API_URL: "https://api.test", VIRGA_OWNER_TOKEN: "tok" }, files: Record<string, string> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const deps: CliDeps = {
    env,
    fetch: fetchImpl,
    stdout: (l) => out.push(l),
    stderr: (l) => err.push(l),
    readFile: async (p) => {
      if (!(p in files)) throw new Error(`ENOENT: ${p}`);
      return files[p]!;
    },
  };
  return runCli(argv, deps).then((r) => ({ code: r.exitCode, out, err }));
}

describe("virga cli", () => {
  it("prints usage without a command and needs an API origin", async () => {
    const api = fakeApi({});
    const none = await run([], api.fetch);
    expect(none.code).toBe(EXIT.usage);
    expect(none.out.join("\n")).toContain("Usage: virga");
    const help = await run(["--help"], api.fetch);
    expect(help.code).toBe(EXIT.ok);
    const noUrl = await run(["stats"], api.fetch, {});
    expect(noUrl.code).toBe(EXIT.usage);
    expect(noUrl.err[0]).toContain("VIRGA_API_URL");
    const unknown = await run(["frobnicate"], api.fetch);
    expect(unknown.code).toBe(EXIT.usage);
  });

  it("health and stats send the bearer token and render both shapes", async () => {
    const api = fakeApi({
      "GET /health": () => Response.json({ status: "ok", service: "site-api", environment: "prod", timestamp: "2026-09-09T00:00:00Z" }),
      "GET /v1/owner/stats": () =>
        Response.json({
          subscribers: { pending: 1, confirmed: 20, unsubscribed: 2 },
          submissions: { new: 3, total: 9 },
          views: { total: 1234, last7Days: 99 },
          reactions: { upvotes: 40, likes: 5 },
          issues: { sent: 4, drafts: 1 },
          generatedAt: "2026-09-09T00:00:00Z",
        }),
    });
    const health = await run(["health"], api.fetch);
    expect(health.code).toBe(EXIT.ok);
    expect(health.out[0]).toBe("ok: site-api (prod) at 2026-09-09T00:00:00Z");
    expect(api.calls[0]!.headers.authorization).toBe("Bearer tok");
    const stats = await run(["stats"], api.fetch);
    expect(stats.out[0]).toBe("subscribers   20 confirmed · 1 pending · 2 unsubscribed");
    const asJson = await run(["stats", "--json"], api.fetch);
    expect(JSON.parse(asJson.out.join("\n"))).toMatchObject({ views: { total: 1234 } });
    const flagged = await run(["health", "--api-url", "https://other.test", "--token", "t2"], api.fetch);
    expect(flagged.code).toBe(EXIT.ok);
    expect(api.calls.at(-1)!.url).toBe("https://other.test/health");
    expect(api.calls.at(-1)!.headers.authorization).toBe("Bearer t2");
  });

  it("maps failures to exit codes", async () => {
    const api = fakeApi({
      "GET /v1/owner/stats": () => Response.json({ error: { code: "unauthenticated", message: "Owner token required", details: {}, requestId: "r" } }, { status: 401 }),
      "GET /v1/owner/issues": () => Response.json({ error: { code: "precondition_failed", message: "nope", details: { reason: "x" }, requestId: "r" } }, { status: 503 }),
      "GET /health": () => Response.json({ status: "degraded" }, { status: 503 }),
    });
    expect((await run(["stats"], api.fetch)).code).toBe(EXIT.unauthenticated);
    const api503 = await run(["issues", "list"], api.fetch);
    expect(api503.code).toBe(EXIT.api);
    expect(api503.err[0]).toBe('precondition_failed (503): nope {"reason":"x"}');
    const degraded = await run(["health"], api.fetch);
    expect(degraded.code).toBe(EXIT.api);
    expect(degraded.out[0]).toContain("degraded");
    const down: typeof fetch = async () => {
      throw new Error("ECONNREFUSED");
    };
    const network = await run(["stats"], down);
    expect(network.code).toBe(EXIT.network);
    expect(network.err[0]).toBe("network: ECONNREFUSED");
  });

  it("lists, exports and pages subscribers; lists and marks submissions", async () => {
    const api = fakeApi({
      "GET /v1/owner/subscribers": (c) =>
        Response.json({
          items: [{ id: "sub_1", email: "a@example.com", status: "confirmed", source: "home", tags: ["beta"], createdAt: "2026-09-01T00:00:00Z", confirmedAt: null, unsubscribedAt: null }],
          nextCursor: new URL(c.url).searchParams.get("cursor") ? null : "abc",
        }),
      "GET /v1/owner/subscribers/export": () => new Response("email,status\na@example.com,confirmed\n", { headers: { "content-type": "text/csv" } }),
      "GET /v1/owner/submissions": () =>
        Response.json({ items: [{ id: "frm_1", form: "contact", fields: { name: "Ada", message: "x".repeat(200) }, status: "new", visitor: null, createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z" }], nextCursor: null }),
      "PATCH /v1/owner/submissions/frm_1": (c) => Response.json({ id: "frm_1", form: "contact", fields: {}, status: JSON.parse(c.body!).status, visitor: null, createdAt: "", updatedAt: "" }),
    });
    const list = await run(["subscribers", "list", "--status", "confirmed", "--limit", "10"], api.fetch);
    expect(list.code).toBe(EXIT.ok);
    expect(api.calls[0]!.url).toBe("https://api.test/v1/owner/subscribers?status=confirmed&limit=10");
    expect(list.out[0]).toMatch(/^email\s+status\s+source\s+tags\s+created$/);
    expect(list.out[2]).toMatch(/^a@example\.com\s+confirmed\s+home\s+beta\s+2026-09-01$/);
    expect(list.out.at(-1)).toBe("next page: --cursor abc");
    const next = await run(["subscribers", "list", "--cursor", "abc"], api.fetch);
    expect(next.out.some((l) => l.startsWith("next page"))).toBe(false);
    const csv = await run(["subscribers", "export"], api.fetch);
    expect(csv.out).toEqual(["email,status\na@example.com,confirmed"]);
    const subs = await run(["submissions", "list", "--form", "contact"], api.fetch);
    expect(subs.out[0]).toBe("frm_1  contact  new  2026-09-01T00:00:00Z");
    expect(subs.out[2]!.length).toBeLessThan(140);
    const marked = await run(["submissions", "mark", "frm_1", "read"], api.fetch);
    expect(marked.out[0]).toBe("frm_1 → read");
    expect((await run(["submissions", "mark", "frm_1", "bogus"], api.fetch)).code).toBe(EXIT.usage);
    expect((await run(["subscribers", "nope"], api.fetch)).code).toBe(EXIT.usage);
  });

  it("creates issues from files and sends only with --yes", async () => {
    const api = fakeApi({
      "POST /v1/owner/issues": (c) => Response.json({ id: "iss_1", slug: JSON.parse(c.body!).slug, subject: "S", html: "<p>x</p>", text: "x", status: "draft", createdAt: "", updatedAt: "", sentAt: null }, { status: 201 }),
      "GET /v1/owner/stats": () => Response.json({ subscribers: { pending: 0, confirmed: 42, unsubscribed: 0 }, submissions: { new: 0, total: 0 }, views: { total: 0, last7Days: 0 }, reactions: { upvotes: 0, likes: 0 }, issues: { sent: 0, drafts: 1 }, generatedAt: "" }),
      "POST /v1/owner/issues/iss_1/send": () => Response.json({ issueId: "iss_1", status: "sending", queued: 5, sent: 40, failed: 2, skipped: 0 }, { status: 202 }),
      "GET /v1/owner/issues/iss_1": () => Response.json({ id: "iss_1", slug: "sept", subject: "S", html: "", text: "", status: "sent", createdAt: "c", updatedAt: "u", sentAt: "s", deliveries: { queued: 0, sent: 47, failed: 0, skipped: 0 } }),
    });
    const files = { "issue.html": "<p>x</p>", "issue.txt": "x" };
    const created = await run(["issues", "create", "--slug", "sept", "--subject", "S", "--html", "issue.html", "--text", "issue.txt"], api.fetch, undefined, files);
    expect(created.code).toBe(EXIT.ok);
    expect(JSON.parse(api.calls[0]!.body!)).toEqual({ slug: "sept", subject: "S", html: "<p>x</p>", text: "x" });
    expect(created.out[0]).toContain("virga issues send iss_1 --yes");
    expect((await run(["issues", "create", "--slug", "sept"], api.fetch)).code).toBe(EXIT.usage);
    const dry = await run(["issues", "send", "iss_1"], api.fetch);
    expect(dry.code).toBe(EXIT.usage);
    expect(dry.err[0]).toBe("would send iss_1 to 42 confirmed subscribers. Re-run with --yes to send.");
    expect(api.calls.some((c) => c.url.endsWith("/send"))).toBe(false);
    const sent = await run(["issues", "send", "iss_1", "--yes"], api.fetch);
    expect(sent.code).toBe(EXIT.ok);
    expect(sent.out[0]).toBe("iss_1: sending — 40 sent · 2 failed · 5 queued · 0 skipped");
    expect(sent.out[1]).toContain("resume");
    const show = await run(["issues", "show", "iss_1"], api.fetch);
    expect(show.out[3]).toBe("deliveries: 0 queued · 47 sent · 0 failed · 0 skipped");
  });
});
