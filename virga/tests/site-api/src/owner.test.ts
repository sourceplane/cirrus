import { harness, bodyOf, OWNER_TOKEN } from "./harness";

async function seed(h: ReturnType<typeof harness>) {
  for (const e of ["a", "b", "c"]) await h.call("POST", "/v1/subscribers", { body: { email: `${e}@example.com`, source: "home" }, ip: `10.0.0.${e.charCodeAt(0)}` });
  // confirm a and b through their mail links
  for (const m of h.mail.sent.filter((s) => s.templateKey === "subscribe.confirm").slice(0, 2)) {
    await h.call("GET", String(m.templateData.confirmUrl).replace("https://api.test", ""));
  }
  await h.call("POST", "/v1/forms/contact", { body: { fields: { name: "x" } } });
}

describe("site-api: owner routes", () => {
  it("gates on the bearer token in constant time and 503s when unconfigured", async () => {
    const h = harness();
    expect((await h.call("GET", "/v1/owner/stats")).status).toBe(401);
    expect((await h.call("GET", "/v1/owner/stats", { headers: { authorization: `Bearer ${OWNER_TOKEN}x` } })).status).toBe(401);
    expect((await h.call("GET", "/v1/owner/stats", { headers: { authorization: "Bearer short" } })).status).toBe(401);
    const unconfigured = harness({ OWNER_TOKEN: undefined });
    expect((await unconfigured.owner("GET", "/v1/owner/stats")).status).toBe(503);
  });

  it("lists, exports and counts subscribers; lists and triages submissions", async () => {
    const h = harness();
    await seed(h);
    const list = await h.owner("GET", "/v1/owner/subscribers?status=confirmed");
    expect(list.status).toBe(200);
    const page = await bodyOf<{ items: Array<{ email: string; status: string }>; nextCursor: string | null }>(list);
    expect(page.items.map((s) => s.email).sort()).toEqual(["a@example.com", "b@example.com"]);
    expect(page.nextCursor).toBeNull();
    expect((await h.owner("GET", "/v1/owner/subscribers?status=nope")).status).toBe(422);

    const csv = await h.owner("GET", "/v1/owner/subscribers/export");
    expect(csv.headers.get("content-type")).toContain("text/csv");
    const text = await csv.text();
    expect(text.split("\n")[0]).toBe("email,status,source,tags,created_at,confirmed_at");
    expect(text).toContain("c@example.com,pending,home,,");

    const subs = await h.owner("GET", "/v1/owner/submissions?form=contact");
    const items = (await bodyOf<{ items: Array<{ id: string; status: string }> }>(subs)).items;
    expect(items).toHaveLength(1);
    const marked = await h.owner("PATCH", `/v1/owner/submissions/${items[0]!.id}`, { status: "read" });
    expect((await bodyOf<{ status: string }>(marked)).status).toBe("read");
    expect((await h.owner("PATCH", "/v1/owner/submissions/frm_00000000000000000000000000000000", { status: "read" })).status).toBe(404);
    expect((await h.owner("PATCH", `/v1/owner/submissions/${items[0]!.id}`, { status: "meh" })).status).toBe(422);

    const stats = await h.owner("GET", "/v1/owner/stats");
    expect(await bodyOf(stats)).toMatchObject({
      subscribers: { pending: 1, confirmed: 2, unsubscribed: 0 },
      submissions: { new: 0, total: 1 },
      issues: { sent: 0, drafts: 0 },
    });
  });

  it("creates issues, derives text from html, and sends through mail-worker", async () => {
    const h = harness();
    await seed(h);
    const created = await h.owner("POST", "/v1/owner/issues", { slug: "issue-1", subject: "Hello", html: "<h1>Hi</h1><p>Body &amp; more</p>" });
    expect(created.status).toBe(201);
    const issue = await bodyOf<{ id: string; text: string; status: string }>(created);
    expect(issue.text).toBe("Hi\nBody & more");
    expect((await h.owner("POST", "/v1/owner/issues", { slug: "issue-1", subject: "Dup", html: "x" })).status).toBe(409);
    expect((await h.owner("POST", "/v1/owner/issues", { slug: "Bad Slug", subject: "", html: "" })).status).toBe(422);

    const one = await h.owner("GET", `/v1/owner/issues/${issue.id}`);
    expect(await bodyOf(one)).toMatchObject({ id: issue.id, deliveries: { queued: 0, sent: 0, failed: 0, skipped: 0 } });

    h.mail.broadcastResponse = () => Response.json({ issueId: issue.id, status: "sent", queued: 0, sent: 2, failed: 0, skipped: 0 });
    const sent = await h.owner("POST", `/v1/owner/issues/${issue.id}/send`);
    expect(sent.status).toBe(202);
    expect(await bodyOf(sent)).toMatchObject({ issueId: issue.id, sent: 2 });
    expect(h.mail.broadcasts).toEqual([{ issueId: issue.id }]);

    h.mail.down = true;
    const failed = await h.owner("POST", `/v1/owner/issues/${issue.id}/send`);
    expect(failed.status).toBe(503);
    expect((await h.owner("POST", "/v1/owner/issues/iss_00000000000000000000000000000000/send")).status).toBe(404);
    const list = await h.owner("GET", "/v1/owner/issues");
    expect((await bodyOf<{ items: unknown[] }>(list)).items).toHaveLength(1);
  });
});
