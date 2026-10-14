import type { Issue, IssueSendReport } from "@site/contracts/newsletter";
import type { Page, SiteStats } from "@site/contracts/owner";
import { flagBool, flagString } from "../args.js";
import type { CommandContext } from "../runner.js";
import { EXIT } from "../exit.js";
import { json, table } from "../output.js";
import { fail, query, usage } from "./shared.js";

export async function runIssues(ctx: CommandContext): Promise<number> {
  const sub = ctx.args[0];
  switch (sub) {
    case "list": {
      const r = await ctx.client.json<Page<Issue>>("GET", `/v1/owner/issues${query(ctx, ["limit", "cursor"])}`);
      if (!r.ok) return fail(ctx, r.failure);
      if (ctx.json) {
        ctx.out(json(r.value));
        return EXIT.ok;
      }
      for (const line of table(
        r.value.items.map((i) => ({ id: i.id, slug: i.slug, status: i.status, subject: i.subject, sent: i.sentAt?.slice(0, 10) ?? "" })),
        ["id", "slug", "status", "subject", "sent"],
      )) ctx.out(line);
      if (r.value.nextCursor) {
        ctx.out("");
        ctx.out(`next page: --cursor ${r.value.nextCursor}`);
      }
      return EXIT.ok;
    }
    case "show": {
      const id = ctx.args[1];
      if (!id) return usage(ctx, "issues show <id>");
      const r = await ctx.client.json<Issue & { deliveries: Record<string, number> | null }>("GET", `/v1/owner/issues/${id}`);
      if (!r.ok) return fail(ctx, r.failure);
      if (ctx.json) {
        ctx.out(json(r.value));
        return EXIT.ok;
      }
      const i = r.value;
      ctx.out(`${i.id}  ${i.slug}  ${i.status}`);
      ctx.out(`subject: ${i.subject}`);
      ctx.out(`created: ${i.createdAt}${i.sentAt ? `  sent: ${i.sentAt}` : ""}`);
      if (i.deliveries) ctx.out(`deliveries: ${Object.entries(i.deliveries).map(([k, v]) => `${v} ${k}`).join(" · ")}`);
      return EXIT.ok;
    }
    case "create": {
      const slug = flagString(ctx.flags, "slug");
      const subject = flagString(ctx.flags, "subject");
      const htmlPath = flagString(ctx.flags, "html");
      if (!slug || !subject || !htmlPath) return usage(ctx, "issues create --slug s --subject t --html file.html [--text file.txt]");
      const html = await ctx.readFile(htmlPath);
      const textPath = flagString(ctx.flags, "text");
      const body: Record<string, string> = { slug, subject, html };
      if (textPath) body.text = await ctx.readFile(textPath);
      const r = await ctx.client.json<Issue>("POST", "/v1/owner/issues", body);
      if (!r.ok) return fail(ctx, r.failure);
      ctx.out(ctx.json ? json(r.value) : `created ${r.value.id} (${r.value.slug}) — send with: virga issues send ${r.value.id} --yes`);
      return EXIT.ok;
    }
    case "send": {
      const id = ctx.args[1];
      if (!id) return usage(ctx, "issues send <id> --yes");
      if (!flagBool(ctx.flags, "yes")) {
        const stats = await ctx.client.json<SiteStats>("GET", "/v1/owner/stats");
        const n = stats.ok ? stats.value.subscribers.confirmed : null;
        ctx.err(`would send ${id} to ${n === null ? "every" : n} confirmed subscriber${n === 1 ? "" : "s"}. Re-run with --yes to send.`);
        return EXIT.usage;
      }
      const r = await ctx.client.json<IssueSendReport>("POST", `/v1/owner/issues/${id}/send`);
      if (!r.ok) return fail(ctx, r.failure);
      const p = r.value;
      ctx.out(ctx.json ? json(p) : `${p.issueId}: ${p.status} — ${p.sent} sent · ${p.failed} failed · ${p.queued} queued · ${p.skipped} skipped`);
      if (p.queued > 0 && !ctx.json) ctx.out("more remain queued: run the same command again to resume");
      return EXIT.ok;
    }
    default:
      return usage(ctx, "issues <list|show|create|send>");
  }
}
