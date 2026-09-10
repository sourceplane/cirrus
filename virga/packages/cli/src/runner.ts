import { parseArgs, flagBool, flagString } from "./args.js";
import { createClient, type ClientFailure, type OwnerClient } from "./client.js";
import { EXIT } from "./exit.js";
import { runHealth } from "./commands/health.js";
import { runStats } from "./commands/stats.js";
import { runSubscribers } from "./commands/subscribers.js";
import { runSubmissions } from "./commands/submissions.js";
import { runIssues } from "./commands/issues.js";

export interface CliDeps {
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
  stdout: (line: string) => void;
  stderr: (line: string) => void;
  readFile: (path: string) => Promise<string>;
}

export interface CliResult {
  exitCode: number;
}

export interface CommandContext {
  client: OwnerClient;
  json: boolean;
  args: string[];
  flags: Record<string, string | true>;
  out: (line: string) => void;
  err: (line: string) => void;
  readFile: (path: string) => Promise<string>;
}

export const USAGE = `virga — owner operations for a Virga site

Usage: virga <command> [options]

Commands:
  health                              site-api health
  stats                               subscribers, submissions, views, reactions, issues
  subscribers list [--status s] [--limit n] [--cursor c]
  subscribers export                  CSV to stdout
  submissions list [--form f] [--status s] [--limit n] [--cursor c]
  submissions mark <id> <new|read|archived|spam>
  issues list [--limit n] [--cursor c]
  issues show <id>
  issues create --slug s --subject t --html file.html [--text file.txt]
  issues send <id> --yes              broadcast to every confirmed subscriber

Options:
  --api-url URL      site-api origin (or VIRGA_API_URL)
  --token TOKEN      owner token (or VIRGA_OWNER_TOKEN)
  --json             machine-readable output
  --help             this text

Exit codes: 0 ok · 1 API error · 2 usage · 3 unauthenticated · 4 network`;

export function describeFailure(f: ClientFailure): string {
  switch (f.kind) {
    case "network":
      return `network: ${f.message}`;
    case "unauthenticated":
      return `unauthenticated: ${f.message} (set VIRGA_OWNER_TOKEN or --token)`;
    case "api":
      return `${f.code} (${f.status}): ${f.message}${Object.keys(f.details).length ? ` ${JSON.stringify(f.details)}` : ""}`;
  }
}

export function exitCodeFor(f: ClientFailure): number {
  return f.kind === "network" ? EXIT.network : f.kind === "unauthenticated" ? EXIT.unauthenticated : EXIT.api;
}

export async function runCli(argv: string[], deps: CliDeps): Promise<CliResult> {
  const { positional, flags } = parseArgs(argv);
  if (positional.length === 0 || flagBool(flags, "help") || positional[0] === "help") {
    deps.stdout(USAGE);
    return { exitCode: positional.length === 0 && !flagBool(flags, "help") ? EXIT.usage : EXIT.ok };
  }
  const apiUrl = flagString(flags, "api-url") ?? deps.env.VIRGA_API_URL;
  if (!apiUrl) {
    deps.stderr("usage: no site-api origin — set VIRGA_API_URL or pass --api-url");
    return { exitCode: EXIT.usage };
  }
  const token = flagString(flags, "token") ?? deps.env.VIRGA_OWNER_TOKEN ?? null;
  const ctx: CommandContext = {
    client: createClient({ apiUrl, token, fetch: deps.fetch }),
    json: flagBool(flags, "json"),
    args: positional.slice(1),
    flags,
    out: deps.stdout,
    err: deps.stderr,
    readFile: deps.readFile,
  };
  const command = positional[0];
  try {
    switch (command) {
      case "health":
        return { exitCode: await runHealth(ctx) };
      case "stats":
        return { exitCode: await runStats(ctx) };
      case "subscribers":
        return { exitCode: await runSubscribers(ctx) };
      case "submissions":
        return { exitCode: await runSubmissions(ctx) };
      case "issues":
        return { exitCode: await runIssues(ctx) };
      default:
        deps.stderr(`usage: unknown command "${command}"\n\n${USAGE}`);
        return { exitCode: EXIT.usage };
    }
  } catch (err) {
    deps.stderr(`fatal: ${err instanceof Error ? err.message : String(err)}`);
    return { exitCode: EXIT.api };
  }
}
