import { renderMail, TEMPLATE_KEYS } from "@mail-worker/templates/index";

const opts = { siteName: "Virga", siteUrl: "https://site.test" };

describe("mail templates", () => {
  it("renders every registered key with subject, html and text", () => {
    for (const key of TEMPLATE_KEYS) {
      const r = renderMail(key, { subject: "S", html: "<p>b</p>", text: "b", confirmUrl: "https://x/y", unsubscribeUrl: "https://x/u", form: "contact", submissionId: "frm_1", summary: "name: a" }, opts);
      expect(r).not.toBeNull();
      expect(r!.subject.length).toBeGreaterThan(0);
      expect(r!.html).toContain("<!doctype html>");
      expect(r!.text.length).toBeGreaterThan(0);
    }
  });

  it("escapes hostile substitutions everywhere except the owner's own issue body", () => {
    const hostile = `<script>alert(1)</script>`;
    const confirm = renderMail("subscribe.confirm", { siteName: hostile, confirmUrl: `https://x/?a="b"` }, opts)!;
    expect(confirm.html).not.toContain("<script>");
    expect(confirm.html).toContain("&lt;script&gt;");
    expect(confirm.html).toContain("&quot;b&quot;");
    const receipt = renderMail("form.receipt", { form: "contact", submissionId: "frm_1", summary: `message: ${hostile}` }, opts)!;
    expect(receipt.html).not.toContain("<script>");
    const issue = renderMail("issue.broadcast", { subject: `Hi ${hostile}`, html: "<p><b>bold</b></p>", text: "bold", unsubscribeUrl: `https://x/u?t=<x>` }, opts)!;
    expect(issue.html).toContain("<p><b>bold</b></p>");
    expect(issue.html).toContain("&lt;x&gt;");
    expect(issue.html).not.toContain("<title>Hi <script>");
    expect(issue.text).toContain("Unsubscribe: https://x/u?t=<x>");
  });

  it("returns null for an unknown key and tolerates missing fields", () => {
    expect(renderMail("nope.nothing", {}, opts)).toBeNull();
    const welcome = renderMail("subscribe.welcome", {}, opts)!;
    expect(welcome.subject).toBe("You're subscribed to Virga");
    expect(welcome.html).not.toContain("Unsubscribe");
  });
});
