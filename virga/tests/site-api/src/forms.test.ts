import { harness, bodyOf } from "./harness";

describe("site-api: forms", () => {
  it("accepts a bounded submission and mails the owner a receipt", async () => {
    const h = harness({ OWNER_EMAIL: "owner@site.test" });
    const res = await h.call("POST", "/v1/forms/contact", { body: { fields: { name: "Ada", message: "Hello" } } });
    expect(res.status).toBe(202);
    const body = await bodyOf<{ id: string; status: string }>(res);
    expect(body.id).toMatch(/^frm_[0-9a-f]{32}$/);
    expect(h.mail.sent).toHaveLength(1);
    expect(h.mail.sent[0]).toMatchObject({ templateKey: "form.receipt", to: "owner@site.test" });
    expect(String(h.mail.sent[0]!.templateData.summary)).toContain("name: Ada");
    const row = h.db.prepare("SELECT form, status, visitor FROM forms_submissions").get() as { form: string; status: string; visitor: string };
    expect(row).toMatchObject({ form: "contact", status: "new" });
    expect(row.visitor).toMatch(/^[0-9a-f]{32}$/);
  });

  it("drops honeypot hits while answering as if accepted", async () => {
    const h = harness({ OWNER_EMAIL: "owner@site.test" });
    const res = await h.call("POST", "/v1/forms/contact", { body: { fields: { name: "bot" }, honeypot: "http://spam" } });
    expect(res.status).toBe(202);
    expect((h.db.prepare("SELECT COUNT(*) AS n FROM forms_submissions").get() as { n: number }).n).toBe(0);
    expect(h.mail.sent).toHaveLength(0);
  });

  it("rejects bad form keys, empty and oversized documents", async () => {
    const h = harness();
    expect((await h.call("POST", "/v1/forms/Bad%20Key", { body: { fields: { a: "b" } } })).status).toBe(404);
    expect((await h.call("POST", "/v1/forms/contact", { body: { fields: {} } })).status).toBe(422);
    expect((await h.call("POST", "/v1/forms/contact", { body: { fields: { a: 1 } } })).status).toBe(422);
    const huge = await h.call("POST", "/v1/forms/contact", { body: { fields: { a: "x".repeat(4001) } } });
    expect(huge.status).toBe(422);
    const many: Record<string, string> = {};
    for (let i = 0; i < 33; i++) many[`f${i}`] = "v";
    expect((await h.call("POST", "/v1/forms/contact", { body: { fields: many } })).status).toBe(422);
  });
});
