import { createLocalDebugProvider } from "@mail-worker/providers/local-debug";
import { createCloudflareEmailProvider, type CloudflareEmailMessage } from "@mail-worker/providers/cloudflare-email";
import { resolveProvider } from "@mail-worker/providers/index";

const msg = { to: "a@example.com", subject: "S", html: "<p>h</p>", text: "t" };

describe("mail providers", () => {
  it("local-debug records and returns a synthetic id", async () => {
    const p = createLocalDebugProvider(false);
    const r = await p.send(msg);
    expect(r.ok).toBe(true);
    expect(r.providerMessageId).toMatch(/^local-1-/);
    expect(p.sent).toHaveLength(1);
  });

  it("cloudflare-email formats the sender and bounds failures", async () => {
    const seen: CloudflareEmailMessage[] = [];
    const ok = createCloudflareEmailProvider({ email: { async send(m) { seen.push(m); return { messageId: "cf-1" }; } }, fromAddress: "hello@mail.test", fromName: "Virga" });
    expect(await ok.send(msg)).toEqual({ ok: true, providerMessageId: "cf-1", error: null });
    expect(seen[0]!.from).toBe("Virga <hello@mail.test>");
    const noId = createCloudflareEmailProvider({ email: { async send() { return { messageId: "" }; } }, fromAddress: "hello@mail.test" });
    expect((await noId.send(msg)).error).toBe("cloudflare_email_missing_message_id");
    const throwing = createCloudflareEmailProvider({ email: { async send() { throw new Error("  domain   not verified\n" + "x".repeat(500)); } }, fromAddress: "hello@mail.test" });
    const r = await throwing.send(msg);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/^cloudflare_email_send_failed: domain not verified/);
    expect(r.error!.length).toBeLessThan(200);
  });

  it("resolves the provider from the environment and falls back safely", () => {
    const original = console.warn;
    let warnings = 0;
    console.warn = () => { warnings += 1; };
    expect(resolveProvider({ ENVIRONMENT: "t" }).name).toBe("local-debug");
    expect(resolveProvider({ ENVIRONMENT: "t", MAIL_PROVIDER: "cloudflare-email" }).name).toBe("local-debug");
    expect(resolveProvider({ ENVIRONMENT: "t", MAIL_PROVIDER: "cloudflare-email", EMAIL: { async send() { return { messageId: "x" }; } }, EMAIL_FROM_ADDRESS: "a@b.co" }).name).toBe("cloudflare-email");
    expect(resolveProvider({ ENVIRONMENT: "t", MAIL_PROVIDER: "carrier-pigeon" }).name).toBe("local-debug");
    console.warn = original;
    expect(warnings).toBe(2);
  });
});
