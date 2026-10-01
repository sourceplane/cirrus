import { harness, bodyOf, TOKEN_SECRET } from "./harness";
import { mintUnsubscribeToken } from "@site/shared/tokens";

describe("site-api: subscribers", () => {
  it("health reports ok with the database reachable", async () => {
    const h = harness();
    const res = await h.call("GET", "/health");
    expect(res.status).toBe(200);
    expect(await bodyOf(res)).toMatchObject({ status: "ok", service: "site-api", environment: "test" });
    expect(res.headers.get("x-request-id")).toMatch(/^req_/);
  });

  it("walks the double opt-in: subscribe → confirm mail → confirm → welcome mail → unsubscribe", async () => {
    const h = harness();
    const sub = await h.call("POST", "/v1/subscribers", { body: { email: "  Ada@Example.com ", source: "home", tags: ["beta"] } });
    expect(sub.status).toBe(202);
    expect(await bodyOf(sub)).toEqual({ status: "pending" });
    expect(h.mail.sent).toHaveLength(1);
    const confirmMail = h.mail.sent[0]!;
    expect(confirmMail).toMatchObject({ templateKey: "subscribe.confirm", to: "ada@example.com" });
    const confirmUrl = String(confirmMail.templateData.confirmUrl);
    expect(confirmUrl).toMatch(/^https:\/\/api\.test\/v1\/subscribers\/confirm\?token=[0-9a-f]{64}&redirect=1$/);

    // The row is pending with a hashed token, never the plaintext.
    const row = h.db.prepare("SELECT status, confirm_token_hash FROM audience_subscribers").get() as { status: string; confirm_token_hash: string };
    expect(row.status).toBe("pending");
    expect(confirmUrl).not.toContain(row.confirm_token_hash);

    // Redirect form of confirm → 302 to the site; welcome mail carries an unsubscribe link.
    const confirm = await h.call("GET", confirmUrl.replace("https://api.test", ""));
    expect(confirm.status).toBe(302);
    expect(confirm.headers.get("location")).toBe("https://site.test/confirm?status=ok");
    expect(h.mail.sent).toHaveLength(2);
    const welcome = h.mail.sent[1]!;
    expect(welcome.templateKey).toBe("subscribe.welcome");
    const unsubscribeUrl = String(welcome.templateData.unsubscribeUrl);
    expect(unsubscribeUrl).toMatch(/^https:\/\/api\.test\/v1\/subscribers\/unsubscribe\?token=.+&redirect=1$/);

    // Second use of the confirm link is invalid.
    const again = await h.call("GET", confirmUrl.replace("https://api.test", "").replace("&redirect=1", ""));
    expect(again.status).toBe(404);

    // Subscribing a confirmed address answers confirmed and sends nothing.
    const dup = await h.call("POST", "/v1/subscribers", { body: { email: "ada@example.com" } });
    expect(await bodyOf(dup)).toEqual({ status: "confirmed" });
    expect(h.mail.sent).toHaveLength(2);

    // One-click unsubscribe from the mail link.
    const unsub = await h.call("GET", unsubscribeUrl.replace("https://api.test", ""));
    expect(unsub.status).toBe(302);
    expect(unsub.headers.get("location")).toBe("https://site.test/unsubscribe?status=ok");
    const after = h.db.prepare("SELECT status FROM audience_subscribers").get() as { status: string };
    expect(after.status).toBe("unsubscribed");

    // A forged token is rejected; the POST form also works with a real one.
    const forged = await h.call("POST", "/v1/subscribers/unsubscribe", { body: { token: "c3ViX3guZGVhZGJlZWY" } });
    expect(forged.status).toBe(404);
    const id = (h.db.prepare("SELECT id FROM audience_subscribers").get() as { id: string }).id;
    const real = await h.call("POST", "/v1/subscribers/unsubscribe", { body: { token: await mintUnsubscribeToken(TOKEN_SECRET, id) } });
    expect(real.status).toBe(200);
  });

  it("validates the subscribe body and never reveals whether an address is known", async () => {
    const h = harness();
    const bad = await h.call("POST", "/v1/subscribers", { body: { email: "nope", tags: ["Bad Tag"] } });
    expect(bad.status).toBe(422);
    const err = await bodyOf<{ error: { code: string; details: { fields: Record<string, string[]> } } }>(bad);
    expect(err.error.code).toBe("validation_failed");
    expect(Object.keys(err.error.details.fields).sort()).toEqual(["email", "tags"]);
    expect((await h.call("POST", "/v1/subscribers", { body: "x" })).status).toBe(400);

    await h.call("POST", "/v1/subscribers", { body: { email: "a@example.com" } });
    // Re-subscribe while pending: 202 pending, but the confirm mail is throttled by KV.
    const again = await h.call("POST", "/v1/subscribers", { body: { email: "a@example.com" } });
    expect(await bodyOf(again)).toEqual({ status: "pending" });
    expect(h.mail.sent).toHaveLength(1);
  });

  it("a mail-worker outage never fails a subscribe", async () => {
    const h = harness();
    h.mail.down = true;
    const res = await h.call("POST", "/v1/subscribers", { body: { email: "a@example.com" } });
    expect(res.status).toBe(202);
    expect((h.db.prepare("SELECT COUNT(*) AS n FROM audience_subscribers").get() as { n: number }).n).toBe(1);
  });

  it("requires a Turnstile token when a secret is configured", async () => {
    const h = harness({ TURNSTILE_SECRET: "ts-secret" });
    const res = await h.call("POST", "/v1/subscribers", { body: { email: "a@example.com" } });
    expect(res.status).toBe(403);
    expect((await bodyOf<{ error: { details: { turnstile: string } } }>(res)).error.details.turnstile).toBe("missing");
  });

  it("unsubscribe answers 503 when TOKEN_SECRET is not seeded", async () => {
    const h = harness({ TOKEN_SECRET: undefined });
    const res = await h.call("POST", "/v1/subscribers/unsubscribe", { body: { token: "x" } });
    expect(res.status).toBe(503);
  });
});
