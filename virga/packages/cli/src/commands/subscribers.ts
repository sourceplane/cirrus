import type { Subscriber } from "@site/contracts/audience";
import type { Page } from "@site/contracts/owner";
import type { CommandContext } from "../runner.js";
import { EXIT } from "../exit.js";
import { json, table } from "../output.js";
import { fail, query, usage } from "./shared.js";

export async function runSubscribers(ctx: CommandContext): Promise<number> {
  const sub = ctx.args[0];
  if (sub === "list") {
    const r = await ctx.client.json<Page<Subscriber>>("GET", `/v1/owner/subscribers${query(ctx, ["status", "limit", "cursor"])}`);
    if (!r.ok) return fail(ctx, r.failure);
    if (ctx.json) {
      ctx.out(json(r.value));
      return EXIT.ok;
    }
    for (const line of table(
      r.value.items.map((s) => ({ email: s.email, status: s.status, source: s.source, tags: s.tags.join(" "), created: s.createdAt.slice(0, 10) })),
      ["email", "status", "source", "tags", "created"],
    )) ctx.out(line);
    if (r.value.nextCursor) {
        ctx.out("");
        ctx.out(`next page: --cursor ${r.value.nextCursor}`);
      }
    return EXIT.ok;
  }
  if (sub === "export") {
    const r = await ctx.client.text("GET", `/v1/owner/subscribers/export${query(ctx, ["status"])}`);
    if (!r.ok) return fail(ctx, r.failure);
    ctx.out(r.value.replace(/\n$/, ""));
    return EXIT.ok;
  }
  return usage(ctx, "subscribers <list|export>");
}
