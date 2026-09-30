#!/usr/bin/env bash
# THE LEAK GATE — what a product carries, and what stays in the factory.
#
# BOOTSTRAP.md describes a product as the thing this baseline MAKES, not a copy
# of this baseline. Until this gate existed, `repo-blueprint.yaml`'s root module
# carried an `include:` list with `ai/`, `specs/`, `flows/`, `BOOTSTRAP.md` and
# both blueprints in it — so every website built from Virga shipped this
# repository's planning state, its epics, its open risks, and the whole factory
# that made it.
#
# Two gates, because they fail differently:
#
#   BY PATH — a factory directory or file must be placed by no module. A
#   product that carries `tasks/` or `testing/` has lanes it cannot pass and
#   documents about a repository it is not.
#
#   BY CONTENT — a product's own context pages must not tell it where the
#   BASELINE came from. rebrand.mjs rewrites this repository's name into the
#   product's; what it cannot rewrite is a sentence about a fork.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

python3 - "$root" <<'PY'
import pathlib, re, sys, yaml

root = pathlib.Path(sys.argv[1])
problems = []
def bad(m): problems.append(m)

bp = yaml.safe_load((root / "repo-blueprint.yaml").read_text())
modules = {m["name"]: m for m in (bp.get("modules") or [])}
phase_modules = {m for ph in (bp.get("phases") or []) for m in (ph.get("modules") or [])}

# Everything any phase places, as repo-relative destinations.
placed = set()
for name in sorted(phase_modules):
    m = modules.get(name)
    if not m:
        continue
    if m.get("mode") == "template":
        placed.update((m.get("files") or {}).keys())
        continue
    to = (m.get("to") or m.get("from") or "").rstrip("/")
    if to in ("", "."):
        bad(f"module {name} places the repository root — an include list is how "
            f"the whole factory shipped; name what a product needs, one path at "
            f"a time")
        continue
    src = root / (m.get("from") or to)
    placed.add(to + "/" if src.is_dir() else to)

# ── BY PATH ────────────────────────────────────────────────────────────────
NEVER = ("flows/", "agents/", "tasks/", "specs/", "testing/", "hooks/",
         "docs/phases/", "tooling/rebrand/", "tooling/bootstrap/",
         "tooling/blueprint/", "tooling/migrations/",
         "BOOTSTRAP.md", "repo-blueprint.yaml", "blueprint.yaml")
for p in sorted(placed):
    for never in NEVER:
        if p == never or p.startswith(never):
            bad(f"{p} would ship — it is the factory, not the product")

# ── ai/context is a declared list, not a directory copy ────────────────────
# The whole point: `ai/context/` holds this repository's decisions, open risks
# and provenance alongside the two pages a product genuinely owns. Copying the
# directory ships all of it.
ALLOWED_AI = {"ai/context/operations.md", "ai/context/deployment.md"}
shipped_ai = {p for p in placed if p.startswith("ai/")}
for p in sorted(shipped_ai):
    if p.endswith("/"):
        bad(f"{p} is a directory copy under ai/ — name the files a product owns "
            f"({', '.join(sorted(ALLOWED_AI))}), or the baseline's planning state "
            f"travels with it")
    elif p not in ALLOWED_AI:
        bad(f"{p} is not one of the {len(ALLOWED_AI)} ai/context files a product "
            f"owns — add it to ALLOWED_AI here with a reason, or stop placing it")

# ── BY CONTENT: provenance, which rebrand has no rule for ──────────────────
# Deliberately NOT a search for "virga". rebrand.mjs rewrites this repository's
# own name into the product's — that is its whole job — so flagging it here
# would mean failing on input rebrand is about to fix.
PROVENANCE = re.compile(
    r"\bcirrus\b|\blumen\b|\bfork(ed)? (of|from)\b|\bbaseline (repo|repository|commit)\b",
    re.I,
)
for rel in sorted(shipped_ai & ALLOWED_AI):
    src = root / rel
    if not src.exists():
        bad(f"{rel} is declared a product file and is not in this repository")
        continue
    for n, line in enumerate(src.read_text(errors="replace").splitlines(), 1):
        if PROVENANCE.search(line):
            bad(f"{rel}:{n} tells the product where the BASELINE came from, which "
                f"rebrand cannot rewrite: {line.strip()[:70]}")

# ── the product's CI must be runnable in the product ───────────────────────
# `github-workflows` copies the whole of .github, so a lane that reads a path no
# module places is a lane that is red on the product's first pull request.
wf = root / ".github" / "workflows"
BASELINE_LANES = {"baseline.yml", "tag.yml", "rehearsal.yml"}
placed_prefixes = tuple(sorted(placed))
for f in sorted(wf.glob("*.yml")) if wf.exists() else []:
    if f.name in BASELINE_LANES:
        continue
    for ref in re.findall(r"(?:node|bash|sh|python3?) ([A-Za-z0-9_./-]+)", f.read_text()):
        if not ref or ref.startswith("-") or "/" not in ref:
            continue
        if not (root / ref).exists():
            continue
        if not any(ref == p or ref.startswith(p) for p in placed):
            bad(f".github/workflows/{f.name} runs {ref}, which no module places — "
                f"in a product that lane cannot pass")

if problems:
    print("FAIL: the product would carry the baseline:", file=sys.stderr)
    for p in problems:
        print(f"  - {p}", file=sys.stderr)
    sys.exit(1)

print(f"   {len(placed)} destinations placed across every phase")
print(f"   ai/context is exactly {len(ALLOWED_AI)} declared file(s)")
print(f"   none of the {len(NEVER)} factory paths; no baseline provenance in the context pack")
PY

echo "leak.test.sh: ok"
