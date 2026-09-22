import type { Submission } from "@site/contracts/forms";
import { SUBMISSION_STATUSES } from "@site/contracts/forms";
import type { Page } from "@site/contracts/owner";
import type { CommandContext } from "../runner.js";
import { EXIT } from "../exit.js";
import { json } from "../output.js";
import { fail, query, usage } from "./shared.js";

export async function runSubmissions(ctx: CommandContext): Promise<number> {
  const sub = ctx.args[0];
  if (sub === "list") {
    const r = await ctx.client.json<Page<Submission>>("GET", `/v1/owner/submissions${query(ctx, ["form", "status", "limit", "cursor"])}`);
    if (!r.ok) return fail(ctx, r.failure);
    if (ctx.json) {
      ctx.out(json(r.value));
      return EXIT.ok;
    }
    for (const s of r.value.items) {
      ctx.out(`${s.id}  ${s.form}  ${s.status}  ${s.createdAt}`);
      for (const [k, v] of Object.entries(s.fields)) ctx.out(`    ${k}: ${v.length > 120 ? `${v.slice(0, 117)}…` : v}`);
    }
    if (r.value.items.length === 0) ctx.out("(none)");
    if (r.value.nextCursor) {
        ctx.out("");
        ctx.out(`next page: --cursor ${r.value.nextCursor}`);
      }
    return EXIT.ok;
  }
  if (sub === "mark") {
    const [, id, status] = ctx.args;
    if (!id || !status || !(SUBMISSION_STATUSES as readonly string[]).includes(status)) {
      return usage(ctx, `submissions mark <id> <${SUBMISSION_STATUSES.join("|")}>`);
    }
    const r = await ctx.client.json<Submission>("PATCH", `/v1/owner/submissions/${id}`, { status });
    if (!r.ok) return fail(ctx, r.failure);
    ctx.out(ctx.json ? json(r.value) : `${r.value.id} → ${r.value.status}`);
    return EXIT.ok;
  }
  return usage(ctx, "submissions <list|mark>");
}
