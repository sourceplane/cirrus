#!/usr/bin/env node
// Self-test for inventory.mjs: builds throwaway repos and asserts the scanner's
// findings and the residue gate's verdicts. Run after editing either:
//   node scripts/selftest.mjs
import { execFileSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const SCANNER = path.join(path.dirname(fileURLToPath(import.meta.url)), "inventory.mjs");
let failed = 0;

function repo(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v2o-"));
  for (const [p, body] of Object.entries(files)) {
    if (body === undefined) continue; // lets a case drop a file from a base fixture
    fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true });
    fs.writeFileSync(path.join(dir, p), typeof body === "string" ? body : JSON.stringify(body, null, 2));
  }
  const git = (...a) => execFileSync("git", ["-C", dir, ...a], { stdio: "ignore" });
  git("init", "-q");
  git("add", "-A");
  git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "fixture");
  return dir;
}
const scan = (dir) => JSON.parse(execFileSync("node", [SCANNER, dir, "--json"], { encoding: "utf8" }));
const gate = (dir) => spawnSync("node", [SCANNER, dir, "--gate"], { encoding: "utf8" });
function check(name, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n    ${detail}`}`);
  if (!ok) failed++;
}

// 1. A typical Vercel app is detected and fails the gate.
const vercelApp = repo({
  "package.json": { dependencies: { next: "15.5.30", "@vercel/kv": "1", "@vercel/blob": "1", "@vercel/analytics": "1", stripe: "1" } },
  "app/page.tsx": "export const revalidate = 60;\nexport default function P() { return null }\n",
  "app/api/x/route.ts": 'export const runtime = "edge";\nexport const maxDuration = 30;\n',
  "vercel.json": { crons: [{ path: "/api/cron", schedule: "0 * * * *" }] },
  "lib/db/schema.ts": 'import { pgTable, uuid } from "drizzle-orm/pg-core";\nexport const t = pgTable("t", { id: uuid().defaultRandom() });\n',
});
const r1 = scan(vercelApp);
const ids = new Set(r1.findings.map((f) => f.id));
for (const id of ["VC-KV", "VC-BLOB", "VC-ANALYTICS", "VC-ISR", "VC-EDGE-RUNTIME", "VC-MAXDURATION", "VC-CRON", "VC-DRIZZLE-PG"]) {
  check(`detects ${id}`, ids.has(id), `findings: ${[...ids].join(",")}`);
}
check("classifies as B:sql-backed", r1.archetype === "B:sql-backed", r1.archetype);
check("reports a D1 blocker for uuid defaults", "uuid-default" in r1.database.postgresOnlyFeatures);
check("gate fails a Vercel app", gate(vercelApp).status === 1);

// 2. A migrated Orun-shaped tree passes.
const migrated = {
  "intent.yaml": "kind: Intent\n",
  "kiox.yaml": "kind: Workspace\n",
  "apps/web/package.json": { name: "@x/web", dependencies: { next: "16.3.8", "@opennextjs/cloudflare": "1.20.9", stripe: "1" } },
  "apps/web/component.yaml": "kind: Component\n",
  "apps/web/app/page.tsx": "export const revalidate = 60;\n",
  "apps/web/open-next.config.ts": "export default defineCloudflareConfig({ incrementalCache: kvIncrementalCache });\n",
  "apps/web/wrangler.template.jsonc": '{ "kv_namespaces": [{ "binding": "K", "id": "@@wiring(cloudflare-kv/stage:k)@@" }] }\n',
  ".github/workflows/ci.yml": "steps:\n  - run: orun plan --intent intent.yaml\n",
  ".gitignore": "apps/web/wrangler.jsonc\n",
};
const ok = repo(migrated);
const g2 = gate(ok);
check("gate passes a migrated tree", g2.status === 0, g2.stdout);

// 3. A rendered but gitignored wrangler.jsonc does not trip the gate…
fs.writeFileSync(path.join(ok, "apps/web/wrangler.jsonc"), '{ "kv_namespaces": [{ "id": "0123456789abcdef0123456789abcdef" }] }');
check("ignores an untracked rendered wrangler.jsonc", gate(ok).status === 0);
// …but a committed one does.
const committed = repo({ ...migrated, ".gitignore": "", "apps/web/wrangler.jsonc": '{ "kv_namespaces": [{ "id": "0123456789abcdef0123456789abcdef" }] }' });
check("fails a committed wrangler.jsonc with a literal id", /WIRING:/.test(gate(committed).stdout));

// 4. Structural and cache rules.
const noCache = repo({ ...migrated, "apps/web/open-next.config.ts": "export default defineCloudflareConfig({});\n" });
check("fails ISR with an empty OpenNext cache", /CACHE:/.test(gate(noCache).stdout));
const directCi = repo({ ...migrated, ".github/workflows/ci.yml": "steps:\n  - run: pnpm exec wrangler deploy\n" });
check("fails CI that deploys with wrangler directly", /CI:/.test(gate(directCi).stdout));
const noComponent = repo({ ...migrated, "apps/web/component.yaml": undefined });
check("fails an app without component.yaml", /STRUCT: apps\/web has no component.yaml/.test(gate(noComponent).stdout));

// 5. Recorded exceptions are waived, nothing else.
const withUpstash = { ...migrated, "apps/web/package.json": { name: "@x/web", dependencies: { next: "16.3.8", "@upstash/redis": "1" } } };
check("fails a leftover second provider", gate(repo(withUpstash)).status === 1);
const waived = repo({ ...withUpstash, "docs/migration/decisions.md": "exception: VC-UPSTASH — interim, exit by P4\n" });
check("waives a recorded exception", gate(waived).status === 0, gate(waived).stdout);

// 6. Version gates.
const old = repo({ "package.json": { dependencies: { next: "15.5.8" } }, "app/page.tsx": "" });
check("warns below the adapter's peer range", scan(old).warnings.some((w) => /peer range/.test(w)));
const proxy = repo({ "package.json": { dependencies: { next: "16.3.8" } }, "app/page.tsx": "", "proxy.ts": "export function proxy() {}\n" });
check("flags Next 16 proxy.ts", scan(proxy).findings.some((f) => f.id === "VC-NODE-PROXY"));

console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
