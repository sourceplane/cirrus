#!/usr/bin/env bash
# EVERY COMPONENT THIS REPO SHIPS IS PLACED BY EXACTLY ONE PHASE (Tier 0).
#
# `repo-blueprint.yaml` decides what a product is made of. A component that no
# module names is not a component a product gets — and nothing would say so.
# The failure is quiet and late: the instance builds, its CI goes green, and
# the missing piece is discovered by whoever needed it.
#
# Needs bash, python3 and git and nothing else — no workspace, no network, no
# credential. It runs in seconds and it can fail a pull request.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

python3 - "$root" <<'PY'
import pathlib, sys, yaml

root = pathlib.Path(sys.argv[1])
problems = []
def bad(m): problems.append(m)

# A component directory this repository deliberately keeps to itself, declared
# with its reason rather than skipped by a pattern: the next baseline-only
# directory should have to be argued for in a diff. The check below refuses an
# exemption whose directory is absent, so a stale entry cannot linger.
BASELINE_ONLY: dict[str, str] = {}

bp = yaml.safe_load((root / "repo-blueprint.yaml").read_text())

# Where each module takes its content from, and which phase places it.
placed_by = {}
for m in bp.get("modules") or []:
    src = (m.get("from") or "").rstrip("/")
    if src:
        placed_by.setdefault(src, []).append(m["name"])
phase_of = {n: ph["name"] for ph in (bp.get("phases") or []) for n in (ph.get("modules") or [])}

components = sorted(
    p.parent.relative_to(root).as_posix()
    for p in root.rglob("component.yaml")
    if "node_modules" not in p.parts and ".git" not in p.parts
)
if not components:
    sys.exit("no component.yaml anywhere — this check has gone blind")

for comp in components:
    modules = placed_by.get(comp, [])
    reason = BASELINE_ONLY.get(comp)
    if reason and modules:
        bad(f"{comp} is declared baseline-only ({reason}) and yet {modules[0]} "
            f"places it — one of the two is wrong")
        continue
    if reason:
        continue
    if not modules:
        bad(f"{comp} is a component and no module places it. Either add one, or "
            f"declare it baseline-only in this file with the reason.")
        continue
    if len(modules) > 1:
        bad(f"{comp} is placed by {len(modules)} modules ({', '.join(modules)}) "
            f"— a component comes from one place")
        continue
    if modules[0] not in phase_of:
        bad(f"{comp} is placed by {modules[0]}, which is in no phase")

# The other direction: a module naming a path this repo does not have places
# nothing, silently. orun resolves `from` against the source tree and an absent
# path is an empty module, not an error.
for src, modules in sorted(placed_by.items()):
    if not (root / src).exists():
        bad(f"module {modules[0]} takes its content from {src}, which does not "
            f"exist — it would place nothing, and say nothing")

for comp in BASELINE_ONLY:
    if not (root / comp).exists():
        bad(f"{comp} is declared baseline-only and does not exist — drop the entry")

# ── WHAT `ignore` ACTUALLY EXCLUDES ────────────────────────────────────────
# orun matches an ignore entry two ways, and WHICH ONE depends on the entry: a
# pattern containing no glob metacharacter is compared against each path
# SEGMENT, and only a pattern containing one is compared against the whole
# relative path. So a bare `apps/site-api/wrangler.jsonc` matches NOTHING — it
# is neither a single segment nor a glob. Asserting it here beats reading the
# engine's matcher from memory a year from now.
GLOB = set("*?[]")
for entry in bp.get("ignore") or []:
    e = str(entry)
    has_glob = any(c in GLOB for c in e)
    if "/" in e and not has_glob:
        bad(f"ignore entry {e!r} has a path separator and no glob metacharacter, "
            f"so it is matched against single path SEGMENTS and can never match. "
            f"Write it as a glob (e.g. {e.rsplit('/',1)[0]}/*/{e.rsplit('/',1)[1]}) "
            f"or as the bare segment.")

# A workflow that reads a path under testing/ must not be in a product, and the
# only way it is not is by being outside the blueprint's `github-workflows`
# module — which copies the whole of .github. So the split is enforced here
# rather than remembered: baseline-only lanes live in baseline.yml and tag.yml,
# and those two are named in `ignore`.
BASELINE_LANES = {"baseline.yml", "tag.yml", "rehearsal.yml"}
ignored = {str(e) for e in (bp.get("ignore") or [])}
wf_dir = root / ".github" / "workflows"
for wf in sorted(wf_dir.glob("*.yml")) if wf_dir.exists() else []:
    # COMMANDS, not prose. A comment saying why a step was moved out of a
    # product lane is not that lane reading testing/ — and a check that cannot
    # tell the difference is a check that punishes the explanation.
    text = "\n".join(
        l for l in wf.read_text().splitlines() if not l.lstrip().startswith("#")
    )
    if "testing/" not in text:
        continue
    if wf.name not in BASELINE_LANES:
        bad(f".github/workflows/{wf.name} reads a path under testing/ and is not "
            f"one of the baseline-only lanes ({', '.join(sorted(BASELINE_LANES))}) "
            f"— testing/ is not placed, so in a product this lane cannot pass")
        continue
    if not any(wf.name in ig for ig in ignored):
        bad(f".github/workflows/{wf.name} is a baseline-only lane and is not in "
            f"the blueprint's `ignore` list — `github-workflows` copies the whole "
            f"of .github, so it would travel into every product and be red on "
            f"its first pull request")

if problems:
    print("FAIL: the blueprint does not account for this repository:", file=sys.stderr)
    for p in problems:
        print(f"  - {p}", file=sys.stderr)
    sys.exit(1)

print(f"   {len(components)} components, each placed by exactly one module in one phase")
print(f"   {len(bp['modules'])} modules, every `from` path present")
print(f"   {len(bp.get('ignore') or [])} ignore entries, each matchable as written")
PY

echo "coverage.test.sh: ok"
