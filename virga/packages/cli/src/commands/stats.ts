import type { SiteStats } from "@site/contracts/owner";
import type { CommandContext } from "../runner.js";
import { EXIT } from "../exit.js";
import { json } from "../output.js";
import { fail } from "./shared.js";

export async function runStats(ctx: CommandContext): Promise<number> {
  const r = await ctx.client.json<SiteStats>("GET", "/v1/owner/stats");
  if (!r.ok) return fail(ctx, r.failure);
  const s = r.value;
  if (ctx.json) {
    ctx.out(json(s));
    return EXIT.ok;
  }
  ctx.out(`subscribers   ${s.subscribers.confirmed} confirmed · ${s.subscribers.pending} pending · ${s.subscribers.unsubscribed} unsubscribed`);
  ctx.out(`submissions   ${s.submissions.new} new · ${s.submissions.total} total`);
  ctx.out(`views         ${s.views.total} total · ${s.views.last7Days} last 7 days`);
  ctx.out(`reactions     ${s.reactions.upvotes} upvotes · ${s.reactions.likes} likes`);
  ctx.out(`issues        ${s.issues.sent} sent · ${s.issues.drafts} drafts`);
  ctx.out(`as of         ${s.generatedAt}`);
  return EXIT.ok;
}
