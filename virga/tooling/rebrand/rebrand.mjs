#!/usr/bin/env node
// Fork/rebrand renamer for the Virga website baseline (zero-dependency).
//
// Virga is a self-contained baseline: instantiate it, rebrand it, deploy it as
// a new site. This script rewrites every *instance identity* literal in the
// tree — repo slug, product domain, display name, CLI bin and its env-var
// prefix, Cloudflare worker resource names (so an instance is account-safe
// even when it shares an account with Virga), the workers.dev subdomain
// placeholder — to the values in a values file, and leaves *org-owned*
// identity alone (the GitHub org `sourceplane`, the orun state backend, the
// `sourceplane.io` manifest apiVersion, company mailboxes).
//
// Usage (from the repo root, on a clean tree):
//   node tooling/rebrand/rebrand.mjs --values my-brand.json [--dry-run]
//   node tooling/rebrand/rebrand.mjs --verify
//
// Values file (see tooling/rebrand/values.example.json):
//   {
//     "repoName":            "acme-blog",           // required — repo slug
//     "productName":         "Acme Blog",           // required — display name
//     "productDomain":       "acme.blog",           // required — product domain
//     "brandSlug":           "acme",                // default: repoName
//     "cliBin":              "acme",                // default: repoName
//     "workersDevSubdomain": "my-subdomain",        // default: your-workers-subdomain
//     "orunWorkspace":       "ws_XXXXXXXX"          // remote-state workspace
//   }
//
// Modes:
//   (default)   apply the rename map in place, then run the leftover sweep
//   --dry-run   report per-pair match counts and files; change nothing
//   --verify    only run the leftover sweep (non-zero exit on residue)

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";

// ── Inputs ─────────────────────────────────────────────────────

function flag(name) {
  return process.argv.includes(`--${name}`);
}
function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const dryRun = flag("dry-run");
const verifyOnly = flag("verify");

let values = {};
if (!verifyOnly) {
  const valuesPath = arg("values");
  if (!valuesPath) {
    console.error("usage: rebrand.mjs --values <file> [--dry-run] | --verify");
    process.exit(2);
  }
  values = JSON.parse(fs.readFileSync(valuesPath, "utf8"));
  for (const required of ["repoName", "productName", "productDomain"]) {
    if (typeof values[required] !== "string" || values[required].length === 0) {
      console.error(`rebrand: values file is missing required field "${required}"`);
      process.exit(2);
    }
  }
}

// All fields are unused under --verify; the fallbacks keep derivation total.
const repoName = values.repoName ?? "";
const productName = values.productName ?? "";
const productDomain = values.productDomain ?? "";
const brandSlug = values.brandSlug ?? repoName;
const cliBin = values.cliBin ?? repoName;
const workersDevSubdomain = values.workersDevSubdomain ?? "your-workers-subdomain";
// A `secret://<workspace>/<project>/<env>/<KEY>` ref names the WORKSPACE first
// and the project (repo) second. In this baseline the workspace segment is
// `lumen` (the org's workspace slug) and the project is `virga`, so the two
// are already distinct — but an instance may live in its own workspace.
const orunWorkspaceSlug = (() => {
  const explicit = (values.orunWorkspaceSlug ?? "").trim();
  if (explicit) return explicit;
  const ws = (values.orunWorkspace ?? "").trim();
  if (ws && !/^ws_/i.test(ws)) return ws; // already a slug
  return "lumen"; // keep the baseline's workspace slug when none is given
})();
const envPrefix = cliBin.toUpperCase().replace(/-/g, "_");

if (!verifyOnly && /[^a-z0-9-]/.test(`${repoName}${brandSlug}${cliBin}`)) {
  console.error("rebrand: repoName/brandSlug/cliBin must be lowercase slugs ([a-z0-9-])");
  process.exit(2);
}

// In-place rewrite of the whole tree: insist on a clean checkout so the result
// is reviewable as one diff (and trivially revertible).
if (!verifyOnly && !dryRun && !flag("allow-dirty")) {
  const status = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" });
  if (status.trim().length > 0) {
    console.error("rebrand: working tree is not clean — commit/stash first (or pass --allow-dirty)");
    process.exit(2);
  }
}

// ── File set ───────────────────────────────────────────────────

// Tracked text files only. Exclusions are generated/locked artifacts, this
// tool itself, or files that intentionally keep baseline-provenance literals.
const EXCLUDE_RE = new RegExp(
  [
    "^tooling/rebrand/",
    "^\\.rebrand/",
    "^ai/context/provenance\\.md$",
    "^pnpm-lock\\.yaml$",
    "^kiox\\.lock$",
    "\\.(png|jpg|jpeg|ico|gif|woff2?|ttf|eot)$",
  ].join("|"),
);

function trackedFiles() {
  return execFileSync("git", ["ls-files"], { encoding: "utf8" })
    .split("\n")
    .filter((f) => f.length > 0 && !EXCLUDE_RE.test(f))
    .filter((f) => {
      // `git ls-files` also lists gitlinks (a grounded sandbox checkout carries
      // `baseline/` as one) and paths deleted from disk. Only regular files are
      // sweepable; a gitlink crashes readFileSync mid-bootstrap.
      try {
        return fs.statSync(f).isFile();
      } catch {
        return false;
      }
    });
}

// ── Protected literals (org-owned identity, never rewritten) ───

const PROTECTED = [
  /https:\/\/api-edge-prod\.oruncloud\.workers\.dev/g, // orun state backend
  /sourceplane\.io/g, // manifest apiVersion, owned by the orun tooling
  /[A-Za-z0-9._%+-]+@sourceplane\.ai/g, // company mailboxes
  /github\.com\/sourceplane/g, // provenance links
];

const MASK = (i, j) => ` REBRAND_PROTECTED_${i}_${j} `;

// ── Worker resource names ──────────────────────────────────────
//
// Every Worker ships brand-prefixed as `virga-<base>` (top-level wrangler
// "name", `<worker>-<env>` service bindings, smoke health-checks, the site's
// CORS origins). The base of each is its `apps/<base>/` directory. Re-prefix
// `virga-<base>` → `<brandSlug>-<base>` so an instance's Workers never collide
// with the baseline's, even in a shared Cloudflare account.
function workerBases(files) {
  const bases = new Set();
  for (const file of files) {
    const m = /^apps\/([^/]+)\//.exec(file);
    if (m) bases.add(m[1]);
  }
  return [...bases];
}

// ── Rename map (ordered, most specific first) ──────────────────

function pairs() {
  return [
    // Mail sender on the product's own subdomain.
    ["mail.virga.site", `mail.${productDomain}`, "mail sending domain"],
    // Product domain wherever it is the *product* (BASE_DOMAIN, custom
    // domains, site.config url, docs). The backend URL is masked above.
    ["virga.site", productDomain, "product domain"],
    // The site's display name in its config (the smoke marker).
    ['name: "Virga"', `name: "${productName}"`, "site display name"],
    // CLI config/env references in docs and command examples.
    ["`virga ", `\`${cliBin} `, "CLI bin (doc examples, open)"],
    ["`virga`", `\`${cliBin}\``, "CLI bin (doc examples, closed)"],
  ];
}

// ── `Virga` (display name vs. code identifier) ─────────────────
//
// Virga has no exported brand-named class, so every `Virga` is prose or copy:
// it becomes the display name everywhere except inside markdown code fences
// and inline code spans, where it is usually a command or a worker name.

function replaceBrandWord(file, text, count) {
  const sub = (chunk, to) =>
    chunk.replace(/Virga/g, () => {
      count();
      return to;
    });

  if (!/\.(md|markdown)$/.test(file)) return sub(text, productName);
  return text
    .split(/(```[\s\S]*?(?:```|$))/)
    .map((part) => {
      if (part.startsWith("```")) return sub(part, productName);
      return part
        .split(/(`[^`\n]+`)/)
        .map((span) => sub(span, productName))
        .join("");
    })
    .join("");
}

// Scoped, regex-based pairs applied after the literal map.
function scopedPairs(files) {
  const list = [
    // Secret refs: `secret://<workspace>/<project>/…`. MUST precede the
    // repo-slug pass, which would otherwise rewrite the workspace segment.
    {
      re: /\bsecret:\/\/[a-z0-9-]+\/virga\//g,
      replacement: () => `secret://${orunWorkspaceSlug}/${repoName}/`,
      label: "secret ref workspace/project",
    },
    // Branded env-var names: VIRGA_API_URL / VIRGA_OWNER_TOKEN and the doc
    // placeholders that name them.
    {
      re: /VIRGA_(?=[A-Z])/g,
      replacement: () => `${envPrefix}_`,
      label: "branded env-var prefix",
    },
    // CLI bin: usage strings, the package bin, doc commands. Inside
    // packages/cli the token only ever means the binary — and inside
    // tests/cli it means the same thing, because that suite asserts on the
    // CLI's own output. Routing the suite through the repo-slug pass instead
    // made every instance whose cliBin differs from its repoName fail its own
    // CLI tests (the source printed `acme`, the test expected `acme-blog`).
    {
      re: /\bvirga\b/g,
      replacement: () => cliBin,
      label: "CLI bin (packages/cli, tests/cli)",
      fileFilter: (file) => file.startsWith("packages/cli/") || file.startsWith("tests/cli/"),
    },
  ];

  // Re-prefix every Cloudflare Worker resource name (`virga-<base>`). The
  // alternation is the explicit set of worker bases, so `virga-stage` /
  // `virga-prod` (the D1 database names, repo-slug-derived) never match here —
  // they fall to the repo-slug pass below.
  const bases = workerBases(files);
  if (bases.length > 0) {
    const wb = bases.slice().sort((a, b) => b.length - a.length).join("|");
    list.push({
      re: new RegExp(`\\bvirga-(${wb})\\b`, "g"),
      replacement: (_file, _m, base) => `${brandSlug}-${base}`,
      label: "worker CF name",
    });
  }

  // The workers.dev subdomain placeholder in wrangler templates and the
  // web-site component. Only rewritten when the caller supplied a real one.
  if (workersDevSubdomain !== "your-workers-subdomain") {
    list.push({
      re: /\byour-workers-subdomain\b/g,
      replacement: () => workersDevSubdomain,
      label: "workers.dev subdomain",
    });
  }

  // Repo slug: intent metadata.name, per-env repo: params, component.yaml
  // repo: fields, Terraform repo defaults, D1 database names
  // (`virga-stage` → `<repo>-stage`), root package name, docs. Runs AFTER the
  // worker pass so `virga-<worker>` has already been consumed. The CLI package
  // and its suite own the CLI-bin meaning (handled above), so both are
  // excluded here.
  list.push({
    re: /\bvirga\b/g,
    replacement: () => repoName,
    label: "repo slug",
    fileFilter: (file) => !file.startsWith("packages/cli/") && !file.startsWith("tests/cli/"),
  });

  return list;
}

// ── Leftover sweep ─────────────────────────────────────────────
//
// After a rebrand (or under --verify) every remaining Virga-identity literal is
// residue: either org-owned (allowed, enumerated below) or a missed rename
// (reported, non-zero exit).

const RESIDUE_RE = /\bvirga\b|virga-|Virga|VIRGA_/g;

const ALLOWED_RESIDUE = [
  /https:\/\/api-edge-prod\.oruncloud\.workers\.dev/,
  /[A-Za-z0-9._%+-]+@sourceplane\.ai/,
  /github\.com\/sourceplane\/[a-z-]+/,
];

function sweep(files, allowedLiterals = []) {
  const residue = [];
  for (const file of files) {
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      // Strip allowed (org-owned) forms first; whatever still matches is residue.
      let cleaned = ALLOWED_RESIDUE.reduce((l, re) => l.replace(new RegExp(re.source, "g"), ""), line);
      // Then the rename's own TARGET values: an instance legitimately named
      // with the brand token inside it (repo "virga-e2e") is not residue.
      for (const lit of allowedLiterals) {
        if (lit) cleaned = cleaned.split(lit).join("");
      }
      if (new RegExp(RESIDUE_RE.source).test(cleaned)) {
        residue.push(`${file}: ${line.trim().slice(0, 120)}`);
      }
    }
  }
  return residue;
}

// ── Main ───────────────────────────────────────────────────────

const files = trackedFiles();

if (verifyOnly) {
  const residue = sweep(files);
  if (residue.length > 0) {
    console.error(`rebrand --verify: ${residue.length} baseline-identity leftover(s):`);
    for (const r of residue) console.error(`  ${r}`);
    process.exit(1);
  }
  console.log("rebrand --verify: no baseline-identity leftovers.");
  process.exit(0);
}

const literalPairs = pairs();
const regexPairs = scopedPairs(files);
const counts = new Map();
const touched = new Set();

for (const file of files) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (text.includes("\0")) continue; // binary safety net
  const original = text;

  // Mask org-owned literals.
  const masks = [];
  PROTECTED.forEach((re, i) => {
    text = text.replace(re, (m) => {
      const token = MASK(i, masks.length);
      masks.push([token, m]);
      return token;
    });
  });

  for (const [from, to, label] of literalPairs) {
    // Idempotent under re-runs: occurrences of `to` are protected first, so a
    // retried scaffold cannot double-apply a pair whose target contains its
    // source ("virga" -> "virga-e2e" -> "virga-e2e-e2e").
    const segments = text.split(to);
    let hits = 0;
    const rewritten = segments
      .map((segment) => segment.split(from).join(to === from ? from : to))
      .join(to);
    hits = segments.reduce((n, segment) => n + segment.split(from).length - 1, 0);
    if (hits > 0) {
      counts.set(label, (counts.get(label) ?? 0) + hits);
      touched.add(file);
      text = rewritten;
    }
  }

  for (const { re, replacement, label, fileFilter } of regexPairs) {
    if (fileFilter && !fileFilter(file)) continue;
    let hits = 0;
    text = text.replace(re, (...args) => {
      hits++;
      return replacement(file, ...args);
    });
    if (hits > 0) {
      counts.set(label, (counts.get(label) ?? 0) + hits);
      touched.add(file);
    }
  }

  let brandHits = 0;
  text = replaceBrandWord(file, text, () => brandHits++);
  if (brandHits > 0) {
    counts.set("display name", (counts.get("display name") ?? 0) + brandHits);
    touched.add(file);
  }

  // Restore org-owned literals.
  for (const [token, literal] of masks) text = text.split(token).join(literal);

  if (text !== original && !dryRun) fs.writeFileSync(file, text);
}

const total = [...counts.values()].reduce((a, b) => a + b, 0);
for (const [label, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`${String(n).padStart(5)}  ${label}`);
}
console.log(`\n${total} replacement(s) across ${touched.size} file(s)${dryRun ? " (dry run — nothing written)" : ""}`);

if (!dryRun) {
  const residue = sweep(trackedFiles(), [repoName, productName, productDomain, brandSlug, cliBin]);
  if (residue.length > 0) {
    console.error(`\nrebrand: ${residue.length} baseline-identity leftover(s):`);
    for (const r of residue) console.error(`  ${r}`);
    process.exit(1);
  }
  console.log("rebrand: no baseline-identity leftovers.");
}
