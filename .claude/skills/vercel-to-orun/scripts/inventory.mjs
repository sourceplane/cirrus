#!/usr/bin/env node
// Vercel-coupling inventory for the vercel-to-orun skill (zero-dependency).
//
// Reads a Vercel-hosted repository as DATA — it never installs, builds, or
// executes anything from the target — and reports every coupling to Vercel
// or to a runtime the Cloudflare-only Orun discipline does not have. Each
// finding carries a rule id (VC-*) that names its row in
// references/feature-map.md, so the migration plan is a lookup, not a guess.
//
// Usage:
//   node inventory.mjs <repo-dir> [--json] [--out <file>]
//   node inventory.mjs <repo-dir> --gate      # residue gate for a MIGRATED tree
//
// Without --gate the exit code is 0 whenever the scan completes; the score is
// the signal. With --gate it exits 1 while any forbidden coupling or
// structural violation remains (see GATE below), and 0 when the tree obeys the
// discipline. A finding is waived only by a line `exception: VC-<ID> — <why>`
// in docs/migration/decisions.md (the G1 record SKILL.md requires).

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const argv = process.argv.slice(2);
const root = argv.find((a) => !a.startsWith("--") && argv[argv.indexOf(a) - 1] !== "--out");
const asJson = argv.includes("--json");
const gateMode = argv.includes("--gate");
const outIdx = argv.indexOf("--out");
const outPath = outIdx >= 0 ? argv[outIdx + 1] : undefined;

if (!root || !fs.existsSync(root)) {
  console.error("usage: inventory.mjs <repo-dir> [--json] [--out <file>]");
  process.exit(2);
}

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", ".turbo", ".vercel", "dist", "build",
  "out", "coverage", ".open-next", ".wrangler", "public", "fixtures",
  "__snapshots__", ".cache", "storybook-static", ".claude",
]);
const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts"]);
const MAX_FILES = 20000;

// ── Walk ─────────────────────────────────────────────────────────
const files = [];
(function walk(dir) {
  if (files.length >= MAX_FILES) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.isSymbolicLink()) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(p);
    } else if (e.isFile()) {
      files.push(p);
    }
  }
})(root);

const rel = (p) => path.relative(root, p) || ".";
const read = (p) => { try { return fs.readFileSync(p, "utf8"); } catch { return ""; } };
const readJson = (p) => { try { return JSON.parse(read(p)); } catch { return undefined; } };
const has = (name) => fs.existsSync(path.join(root, name));

// ── Workspace shape ─────────────────────────────────────────────
const pkgFiles = files.filter((f) => path.basename(f) === "package.json");
const pkgs = pkgFiles.map((f) => ({ file: rel(f), json: readJson(f) || {} }));
const rootPkg = readJson(path.join(root, "package.json")) || {};

const packageManager =
  has("pnpm-lock.yaml") ? "pnpm" :
  has("bun.lockb") || has("bun.lock") ? "bun" :
  has("yarn.lock") ? "yarn" :
  has("package-lock.json") ? "npm" : (rootPkg.packageManager || "unknown").split("@")[0];

const monorepo = {
  pnpmWorkspace: has("pnpm-workspace.yaml"),
  turbo: has("turbo.json"),
  workspacesField: Boolean(rootPkg.workspaces),
  packageCount: pkgs.length,
};
monorepo.isMonorepo = monorepo.pnpmWorkspace || monorepo.workspacesField || pkgs.length > 1;

// Next.js apps: any package.json depending on `next`.
const allDeps = (j) => ({ ...(j.dependencies || {}), ...(j.devDependencies || {}), ...(j.peerDependencies || {}) });
const nextApps = pkgs
  .filter((p) => allDeps(p.json).next)
  .map((p) => {
    const dir = path.dirname(path.join(root, p.file));
    const appRouter = fs.existsSync(path.join(dir, "app")) || fs.existsSync(path.join(dir, "src/app"));
    const pagesRouter = fs.existsSync(path.join(dir, "pages")) || fs.existsSync(path.join(dir, "src/pages"));
    return {
      name: p.json.name || path.basename(dir),
      dir: rel(dir),
      next: allDeps(p.json).next,
      router: appRouter && pagesRouter ? "app+pages" : appRouter ? "app" : pagesRouter ? "pages" : "unknown",
    };
  })
  // A package that only peer-depends on next (a UI kit) is not an app.
  .filter((a) => a.router !== "unknown");

// ── Rule catalogue ──────────────────────────────────────────────
// weight: contribution to the difficulty score. `dep` matches a dependency
// name (string or RegExp); `code` matches source text; `file` matches a path.
const RULES = [
  // Vercel platform services
  { id: "VC-KV", title: "@vercel/kv (Upstash Redis)", weight: 2, dep: "@vercel/kv" },
  { id: "VC-UPSTASH", title: "Upstash Redis / ratelimit / QStash", weight: 2, dep: /^@upstash\// },
  { id: "VC-REDIS", title: "TCP Redis client (ioredis/redis)", weight: 3, dep: /^(ioredis|redis)$/ },
  { id: "VC-BLOB", title: "@vercel/blob", weight: 2, dep: "@vercel/blob" },
  { id: "VC-PG", title: "@vercel/postgres / Neon serverless", weight: 3, dep: /^(@vercel\/postgres|@neondatabase\/serverless)$/ },
  { id: "VC-EDGECONFIG", title: "@vercel/edge-config", weight: 2, dep: "@vercel/edge-config" },
  { id: "VC-ANALYTICS", title: "@vercel/analytics / speed-insights", weight: 0.5, dep: /^@vercel\/(analytics|speed-insights)$/ },
  { id: "VC-OG", title: "@vercel/og / next/og ImageResponse", weight: 1, dep: "@vercel/og", code: /from ["']next\/og["']/ },
  { id: "VC-FUNCTIONS", title: "@vercel/functions (waitUntil, geolocation, ipAddress)", weight: 1.5, dep: "@vercel/functions", code: /from ["']@vercel\/functions["']/ },
  { id: "VC-FLAGS", title: "@vercel/flags / flags SDK", weight: 1, dep: /^(@vercel\/flags|flags)$/ },
  { id: "VC-OTEL", title: "@vercel/otel", weight: 0.5, dep: "@vercel/otel" },
  { id: "VC-SANDBOX", title: "@vercel/sandbox", weight: 4, dep: "@vercel/sandbox" },
  { id: "VC-BOTID", title: "Vercel BotID", weight: 1, dep: "botid" },
  { id: "VC-QUEUE", title: "Vercel Queues / Workflow / QStash", weight: 3, dep: /^(@vercel\/queue|@vercel\/workflow|workflow|@upstash\/qstash|@upstash\/workflow)$/ },
  { id: "VC-AIGATEWAY", title: "Vercel AI Gateway", weight: 1, dep: "@ai-sdk/gateway", code: /AI_GATEWAY_API_KEY|from ["']@ai-sdk\/gateway["']/ },
  { id: "VC-ENVVARS", title: "VERCEL_* system env vars", weight: 1, code: /process\.env\.(NEXT_PUBLIC_)?VERCEL_[A-Z_]+/ },

  // Next.js runtime features that change meaning on Workers
  { id: "VC-EDGE-RUNTIME", title: "export const runtime = 'edge'", weight: 1, code: /export\s+const\s+runtime\s*=\s*["']edge["']/ },
  { id: "VC-ISR", title: "ISR / revalidate / unstable_cache / revalidateTag", weight: 2, code: /export\s+const\s+revalidate\s*=|revalidate(Tag|Path)\(|unstable_cache\(|["']use cache["']/ },
  { id: "VC-AFTER", title: "next/server after()", weight: 1, code: /\bafter\s*\(\s*(async\s*)?\(/ },
  { id: "VC-MAXDURATION", title: "maxDuration / preferredRegion", weight: 1, code: /export\s+const\s+(maxDuration|preferredRegion)\s*=/ },
  { id: "VC-IMAGE", title: "next/image optimisation", weight: 1, code: /from ["']next\/image["']/ },
  { id: "VC-MIDDLEWARE", title: "middleware.ts / proxy.ts (Next 16)", weight: 0.5, file: /(^|\/)(src\/)?(middleware|proxy)\.(ts|js)$/ },
  { id: "VC-NODE-PROXY", title: "Node-runtime middleware (proxy.ts or runtime: 'nodejs')", weight: 1.5, file: /(^|\/)(src\/)?proxy\.(ts|js)$/ },
  { id: "VC-USE-CACHE", title: "'use cache' / cacheComponents", weight: 1.5, code: /^\s*["']use cache(: \w+)?["']/m },

  // Data plane
  { id: "VC-PRISMA", title: "Prisma", weight: 3, dep: /^(@prisma\/client|prisma)$/ },
  { id: "VC-DRIZZLE-PG", title: "Drizzle (Postgres dialect)", weight: 2, code: /from ["']drizzle-orm\/pg-core["']/ },
  { id: "VC-DRIZZLE-MYSQL", title: "Drizzle (MySQL dialect)", weight: 2, code: /from ["']drizzle-orm\/mysql-core["']/ },
  { id: "VC-DRIZZLE-SQLITE", title: "Drizzle (SQLite dialect — D1-ready)", weight: 0, code: /from ["']drizzle-orm\/sqlite-core["']/ },
  { id: "VC-PG-DRIVER", title: "TCP Postgres driver (pg / postgres)", weight: 2, dep: /^(pg|postgres)$/ },
  { id: "VC-MYSQL", title: "MySQL / PlanetScale driver", weight: 2, dep: /^(mysql2|@planetscale\/database)$/ },
  { id: "VC-SUPABASE", title: "Supabase (DB + Auth + RLS)", weight: 4, dep: /^@supabase\/(supabase-js|ssr|auth-helpers-nextjs)$/ },
  { id: "VC-KYSELY", title: "Kysely", weight: 1.5, dep: "kysely" },
  { id: "VC-MONGO", title: "MongoDB", weight: 4, dep: /^(mongodb|mongoose)$/ },

  // Auth & payments
  { id: "VC-NEXTAUTH", title: "NextAuth / Auth.js", weight: 1.5, dep: /^(next-auth|@auth\/core)$/ },
  { id: "VC-CLERK", title: "Clerk", weight: 0.5, dep: /^@clerk\// },
  { id: "VC-BETTERAUTH", title: "Better Auth", weight: 1, dep: "better-auth" },
  { id: "VC-STRIPE", title: "Stripe", weight: 1, dep: "stripe" },

  // Node-only / native deps that break on workerd
  { id: "VC-NATIVE", title: "Native / Node-only dependency", weight: 2, dep: /^(sharp|bcrypt|argon2|canvas|puppeteer|playwright-core|@sparticuz\/chromium|nodemailer|better-sqlite3|node-cron|bull|bullmq)$/ },

  // Vercel config
  { id: "VC-CRON", title: "vercel.json crons", weight: 2 },
  { id: "VC-VERCELJSON", title: "vercel.json rewrites/headers/redirects/functions", weight: 1 },
];

// ── Evaluate ───────────────────────────────────────────────────
const findings = new Map(); // id -> { rule, evidence: [] }
const hit = (rule, evidence) => {
  if (!findings.has(rule.id)) findings.set(rule.id, { ...rule, evidence: [] });
  const f = findings.get(rule.id);
  if (f.evidence.length < 8 && !f.evidence.includes(evidence)) f.evidence.push(evidence);
};

for (const p of pkgs) {
  const deps = allDeps(p.json);
  for (const name of Object.keys(deps)) {
    for (const r of RULES) {
      if (!r.dep) continue;
      const ok = typeof r.dep === "string" ? r.dep === name : r.dep.test(name);
      if (ok) hit(r, `${p.file}: ${name}@${deps[name]}`);
    }
  }
}

let codeFiles = 0;
for (const f of files) {
  const rp = rel(f);
  for (const r of RULES) if (r.file && r.file.test(rp)) hit(r, rp);
  if (!CODE_EXT.has(path.extname(f))) continue;
  codeFiles++;
  const text = read(f);
  if (text.length > 400_000) continue;
  for (const r of RULES) if (r.code && r.code.test(text)) hit(r, rp);
}

// vercel.json (any depth, apps in monorepos carry their own)
const vercelJsons = files.filter((f) => path.basename(f) === "vercel.json");
const crons = [];
for (const f of vercelJsons) {
  const j = readJson(f) || {};
  for (const c of j.crons || []) crons.push({ file: rel(f), ...c });
  const keys = ["rewrites", "redirects", "headers", "functions", "regions", "routes"].filter((k) => j[k]);
  if (keys.length) hit(RULES.find((r) => r.id === "VC-VERCELJSON"), `${rel(f)}: ${keys.join(", ")}`);
}
if (crons.length) for (const c of crons) hit(RULES.find((r) => r.id === "VC-CRON"), `${c.file}: ${c.schedule} → ${c.path}`);

// ── Schema dialect analysis (Postgres → D1 risk) ──────────────
const PG_FEATURES = [
  ["enum", /\b(pgEnum|CREATE TYPE .* AS ENUM|^\s*enum\s+\w+\s*\{)/im],
  ["jsonb", /\bjsonb\b|@db\.JsonB|\bJson\b\s/],
  ["arrays", /\.array\(\)|\[\]\s*(@|$)|\btext\[\]|String\[\]/m],
  ["uuid-default", /gen_random_uuid|uuid_generate_v4|defaultRandom\(\)|@default\(uuid\(\)\)|@db\.Uuid/],
  ["timestamptz", /timestamptz|withTimezone:\s*true|@db\.Timestamptz/i],
  ["rls-policies", /CREATE POLICY|ENABLE ROW LEVEL SECURITY/i],
  ["plpgsql", /LANGUAGE plpgsql|CREATE (OR REPLACE )?FUNCTION|CREATE TRIGGER/i],
  ["full-text", /tsvector|to_tsquery|@@ to_tsquery|fullTextSearch/i],
  ["interactive-tx", /\$transaction\(\s*async|\.transaction\(\s*async/],
  ["decimal", /@db\.Decimal|numeric\(|decimal\(/i],
];
const schemaFiles = files.filter((f) =>
  /schema\.prisma$/.test(f) ||
  /(^|\/)(drizzle|db|lib\/db|database)\/.*schema.*\.(ts|js)$/.test(rel(f)) ||
  /(^|\/)schema\.ts$/.test(rel(f)) ||
  /supabase\/(migrations\/.*\.sql|schema\.sql)$/.test(rel(f)) ||
  /migrations\/.*\.sql$/.test(rel(f)),
);
const prismaProviders = new Set();
const dialectRisks = {};
for (const f of schemaFiles) {
  const t = read(f);
  const m = t.match(/datasource\s+\w+\s*\{[^}]*provider\s*=\s*"(\w+)"/);
  if (m) prismaProviders.add(m[1]);
  for (const [name, re] of PG_FEATURES) {
    if (re.test(t)) (dialectRisks[name] ||= []).length < 4 && dialectRisks[name].push(rel(f));
  }
}
// Interactive transactions live in application code, not the schema.
for (const f of files) {
  if (!CODE_EXT.has(path.extname(f))) continue;
  if (/\$transaction\(\s*async|\.transaction\(\s*async/.test(read(f))) {
    (dialectRisks["interactive-tx"] ||= []).length < 6 && !dialectRisks["interactive-tx"].includes(rel(f)) && dialectRisks["interactive-tx"].push(rel(f));
  }
}

// ── Env surface (names only — values are never read) ─────────
const envNames = new Set();
for (const f of files.filter((f) => /\.env(\.[\w-]+)?\.(example|sample|template)$|\.env\.example$|env\.example$/.test(path.basename(f)))) {
  for (const line of read(f).split("\n")) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]+)\s*=/);
    if (m) envNames.add(m[1]);
  }
}

// Env-only signals: the AI SDK routes plain "provider/model" strings through
// Vercel's AI Gateway whenever AI_GATEWAY_API_KEY is set — no import to grep.
if (envNames.has("AI_GATEWAY_API_KEY")) hit(RULES.find((r) => r.id === "VC-AIGATEWAY"), ".env.example: AI_GATEWAY_API_KEY");

// ── Score ──────────────────────────────────────────────────────
// 1 = static/near-static app, 5 = re-platform the data plane AND auth.
let raw = 0;
for (const f of findings.values()) raw += f.weight;
raw += Object.keys(dialectRisks).length * 0.75;
if (monorepo.isMonorepo && nextApps.length > 1) raw += 1.5;
if (codeFiles > 1500) raw += 2; else if (codeFiles > 400) raw += 1;
const score = raw < 3 ? 1 : raw < 7 ? 2 : raw < 12 ? 3 : raw < 20 ? 4 : 5;

// Version gates the adapter cares about (checked again in Step 0 of SKILL.md).
// Peer range of the adapter release this skill was proven with; refresh with
// `npm view @opennextjs/cloudflare peerDependencies` when bumping it.
const ADAPTER = { version: "1.20.9", ranges: [["15.5.27", "16.0.0"], ["16.3.8", "99.0.0"]] };
const cmp = (a, b) => {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
};
const warnings = [];
for (const a of nextApps) {
  const v = String(a.next);
  const major = Number((v.match(/(\d+)\./) || [])[1]);
  if (/canary|rc|beta/.test(v)) warnings.push(`${a.dir}: next@${v} is a pre-release — pin a stable release the OpenNext adapter lists as supported before migrating`);
  if (major && major < 14) warnings.push(`${a.dir}: next@${v} — upgrade to >=14 first; @opennextjs/cloudflare does not target older majors`);
  const exact = (v.match(/(\d+\.\d+\.\d+)/) || [])[1];
  if (exact && !ADAPTER.ranges.some(([lo, hi]) => cmp(exact, lo) >= 0 && cmp(exact, hi) < 0)) {
    warnings.push(`${a.dir}: next@${v} is outside @opennextjs/cloudflare@${ADAPTER.version}'s peer range (>=15.5.27 <16 || >=16.3.8) — Gate G0: bump first, as its own commit`);
  }
  const hasProxy = ["proxy.ts", "proxy.js", "src/proxy.ts", "src/proxy.js"].some((n) => fs.existsSync(path.join(root, a.dir, n)));
  if (major >= 16 && hasProxy) warnings.push(`${a.dir}: next@${v} with proxy.ts — proxy runs on the Node runtime, which @opennextjs/cloudflare treats as experimental; rename to middleware.ts (edge) per feature-map VC-NODE-PROXY`);
  if (major >= 16) warnings.push(`${a.dir}: next@${v} — pin the Next release the adapter is TESTED with, not just its peer range (proof: adapter 1.20.9 + next 16.3.8 runs; next 16.4.0 builds but 500s at runtime on a missing preview-props.json manifest)`);
}
if (has("vercel.json") === false && vercelJsons.length === 0 && !nextApps.length) warnings.push("no Next.js app and no vercel.json found — this skill may not apply");

// Archetype drives which section of the skill applies first.
const ids = new Set(findings.keys());
const archetype =
  ids.has("VC-SUPABASE") ? "C:supabase-backed" :
  ids.has("VC-PRISMA") || ids.has("VC-DRIZZLE-PG") || ids.has("VC-DRIZZLE-MYSQL") || ids.has("VC-PG") || ids.has("VC-PG-DRIVER") || ids.has("VC-MYSQL") || ids.has("VC-MONGO") ? "B:sql-backed" :
  ids.has("VC-KV") || ids.has("VC-UPSTASH") || ids.has("VC-REDIS") || ids.has("VC-EDGECONFIG") ? "A2:kv-backed" :
  "A1:stateless";

const report = {
  schema: "vercel-to-orun/inventory@v1",
  repo: path.resolve(root),
  shape: { packageManager, monorepo, nextApps, codeFiles },
  archetype,
  score,
  warnings,
  rawScore: Number(raw.toFixed(2)),
  findings: [...findings.values()]
    .sort((a, b) => b.weight - a.weight)
    .map(({ id, title, weight, evidence }) => ({ id, title, weight, evidence })),
  crons,
  database: {
    prismaProviders: [...prismaProviders],
    schemaFiles: schemaFiles.map(rel).slice(0, 20),
    postgresOnlyFeatures: dialectRisks,
  },
  envNames: [...envNames].sort(),
};


// ── GATE: residue check for a migrated tree ──────────────────────
// Rules that may legitimately remain after migration (they run on workerd once
// configured per feature-map.md). Everything else is a coupling to remove.
const ALLOWED = new Set([
  "VC-STRIPE", "VC-MIDDLEWARE", "VC-NODE-PROXY", "VC-DRIZZLE-SQLITE", "VC-NEXTAUTH",
  "VC-BETTERAUTH", "VC-CLERK", "VC-OG", "VC-IMAGE", "VC-ISR", "VC-USE-CACHE",
  "VC-AFTER", "VC-KYSELY", "VC-PRISMA",
]);
function gate() {
  const violations = [];
  const decisions = read(path.join(root, "docs/migration/decisions.md"));
  const waived = new Set([...decisions.matchAll(/exception:\s*(VC-[A-Z0-9-]+)/g)].map((m) => m[1]));

  for (const f of findings.values()) {
    if (waived.has(f.id)) continue;
    if (f.id === "VC-OG" && f.evidence.some((e) => e.includes("@vercel/og"))) {
      violations.push(`VC-OG: @vercel/og still present — import ImageResponse from next/og (${f.evidence[0]})`);
    } else if (f.id === "VC-PRISMA" && [...prismaProviders].some((p) => p !== "sqlite")) {
      violations.push(`VC-PRISMA: datasource provider ${[...prismaProviders].join(",")} — D1 needs provider "sqlite" + @prisma/adapter-d1`);
    } else if (!ALLOWED.has(f.id)) {
      violations.push(`${f.id}: ${f.title} — ${f.evidence.slice(0, 2).join("; ")}`);
    }
  }

  if (!has("intent.yaml")) violations.push("STRUCT: no intent.yaml at the repo root");
  if (!has("kiox.yaml")) violations.push("STRUCT: no kiox.yaml pinning the orun runtime");
  for (const a of nextApps) {
    if (!fs.existsSync(path.join(root, a.dir, "component.yaml"))) violations.push(`STRUCT: ${a.dir} has no component.yaml`);
  }
  for (const f of vercelJsons) violations.push(`STRUCT: ${rel(f)} still present`);
  if (has(".vercel")) violations.push("STRUCT: .vercel/ still present");

  // Committed wrangler configs must not carry resource ids (render from a template).
  // A rendered, gitignored wrangler.jsonc is fine — only tracked files count.
  const tracked = (f) => {
    try {
      execFileSync("git", ["-C", root, "ls-files", "--error-unmatch", rel(f)], { stdio: "ignore" });
      return true;
    } catch {
      return !fs.existsSync(path.join(root, ".git")); // not a git tree: judge the file
    }
  };
  for (const f of files.filter((f) => /^wrangler\.(jsonc?|toml)$/.test(path.basename(f)) && tracked(f))) {
    const t = read(f);
    if (/"(database_id|id|bucket_name)"\s*:\s*"[0-9a-f]{32}"|database_id\s*=\s*"[0-9a-f-]{32,36}"/.test(t)) {
      violations.push(`WIRING: ${rel(f)} commits a literal resource id — use wrangler.template.jsonc + @@wiring(...)@@`);
    }
  }

  // ISR / 'use cache' need a real OpenNext cache, not the dummy default.
  if (findings.has("VC-ISR") || findings.has("VC-USE-CACHE")) {
    for (const a of nextApps) {
      const cfg = ["open-next.config.ts", "open-next.config.mjs", "open-next.config.js"]
        .map((n) => path.join(root, a.dir, n)).find((p) => fs.existsSync(p));
      if (!cfg) violations.push(`CACHE: ${a.dir} has no open-next.config.* (OpenNext adapter not configured)`);
      else if (!/incrementalCache/.test(read(cfg))) violations.push(`CACHE: ${rel(cfg)} has no incrementalCache — ISR/revalidateTag would be silent no-ops`);
    }
  }

  // CI must only plan/run through orun.
  for (const f of files.filter((f) => /\.github\/workflows\/.*\.ya?ml$/.test(rel(f)))) {
    const t = read(f);
    const m = t.match(/\b(wrangler (deploy|d1|kv|r2|secret)|terraform (apply|plan|init)|vercel( deploy| build| pull| --prod|\b))/);
    if (m) violations.push(`CI: ${rel(f)} runs \`${m[0]}\` directly — only orun plan / orun run belong in CI`);
  }
  return { violations, waived: [...waived] };
}

// ── Render ─────────────────────────────────────────────────────
function markdown(r) {
  const L = [];
  L.push(`# Vercel → Orun inventory: ${path.basename(r.repo)}`, "");
  L.push(`- **Archetype:** \`${r.archetype}\`  **Difficulty:** ${r.score}/5 (raw ${r.rawScore})`);
  L.push(`- **Package manager:** ${r.shape.packageManager}; monorepo: ${r.shape.monorepo.isMonorepo} (turbo: ${r.shape.monorepo.turbo}, packages: ${r.shape.monorepo.packageCount}); code files: ${r.shape.codeFiles}`);
  for (const a of r.shape.nextApps) L.push(`- **Next app:** \`${a.dir}\` (${a.name}) next@${a.next}, router: ${a.router}`);
  for (const w of r.warnings) L.push(`- ⚠️ ${w}`);
  L.push("", "## Findings (rule → references/feature-map.md)", "", "| Rule | What | Weight | Evidence |", "|---|---|---|---|");
  for (const f of r.findings) L.push(`| ${f.id} | ${f.title} | ${f.weight} | ${f.evidence.slice(0, 3).map((e) => `\`${e}\``).join("<br>")}${f.evidence.length > 3 ? ` (+${f.evidence.length - 3})` : ""} |`);
  if (r.crons.length) {
    L.push("", "## Crons → scheduled worker", "");
    for (const c of r.crons) L.push(`- \`${c.schedule}\` → \`${c.path}\` (${c.file})`);
  }
  L.push("", "## Database", "");
  L.push(`- Prisma providers: ${r.database.prismaProviders.join(", ") || "—"}`);
  L.push(`- Schema files: ${r.database.schemaFiles.length ? r.database.schemaFiles.slice(0, 6).map((s) => `\`${s}\``).join(", ") : "—"}`);
  const risks = Object.entries(r.database.postgresOnlyFeatures);
  L.push(`- D1 blockers: ${risks.length ? risks.map(([k, v]) => `**${k}** (${v.length})`).join(", ") : "none detected"}`);
  if (r.envNames.length) L.push("", "## Env surface (names only)", "", r.envNames.map((n) => `\`${n}\``).join(" "));
  return L.join("\n") + "\n";
}

if (gateMode) {
  const { violations, waived } = gate();
  if (waived.length) console.log(`waived by docs/migration/decisions.md: ${waived.join(", ")}`);
  if (violations.length) {
    console.log(`✗ residue gate: ${violations.length} violation(s) in ${path.basename(path.resolve(root))}`);
    for (const v of violations) console.log(`  - ${v}`);
    process.exit(1);
  }
  console.log(`✓ residue gate: ${path.basename(path.resolve(root))} obeys the Orun/Cloudflare discipline`);
  process.exit(0);
}

const output = asJson ? JSON.stringify(report, null, 2) + "\n" : markdown(report);
if (outPath) fs.writeFileSync(outPath, output);
else process.stdout.write(output);
