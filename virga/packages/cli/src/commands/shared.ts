import type { CommandContext } from "../runner.js";
import { describeFailure, exitCodeFor } from "../runner.js";
import type { ClientFailure } from "../client.js";
import { EXIT } from "../exit.js";
import { flagString } from "../args.js";

export function fail(ctx: CommandContext, failure: ClientFailure): number {
  ctx.err(describeFailure(failure));
  return exitCodeFor(failure);
}

export function usage(ctx: CommandContext, message: string): number {
  ctx.err(`usage: ${message}`);
  return EXIT.usage;
}

/** Build a query string from the paging/filter flags a listing accepts. */
export function query(ctx: CommandContext, names: string[]): string {
  const params = new URLSearchParams();
  for (const name of names) {
    const v = flagString(ctx.flags, name);
    if (v !== undefined) params.set(name, v);
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}
