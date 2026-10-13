#!/usr/bin/env bash
# THE PHASES IN `repo-blueprint.yaml` MUST BE THE PHASES THE BOOTSTRAP RUNS.
#
# Before the one-document model this could not be checked, because the two were
# different documents: `tooling/blueprint/split-phases.py` derived a
# `flows/phases/*/blueprint.yaml` slice per phase, and the derivation had to
# PRUNE every cross-phase `dependsOn` edge — a slice naming a module in another
# slice does not parse. A pruned edge to a module in no phase looked exactly
# like a pruned edge to a module in an earlier one, so the splitter silently
# deleted real edges for as long as it ran.
#
# The prune is what is gone. orun's phase overlay enforces the barrier by
# REFUSING a dependency that points forward across it, and a refusal and a
# deletion are not the same thing. This check is that refusal, run offline.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

python3 - "$root" <<'PY'
import pathlib, sys, yaml

root = pathlib.Path(sys.argv[1])
problems = []
def bad(m): problems.append(m)

bp = yaml.safe_load((root / "repo-blueprint.yaml").read_text())
modules = {m["name"]: m for m in (bp.get("modules") or [])}
phases = bp.get("phases") or []
if not phases:
    sys.exit("repo-blueprint.yaml declares no phases")

order = [ph["name"] for ph in phases]
index = {name: i for i, name in enumerate(order)}
by_name = {ph["name"]: ph for ph in phases}
# A phase out of sequence is a barrier in the wrong place.
if order != sorted(order):
    bad(f"phases are declared out of order ({', '.join(order)}); the document's "
        f"order IS the execution order")
phase_of = {}
for ph in phases:
    for m in ph.get("modules") or []:
        if m in phase_of:
            bad(f"module {m} is placed by both {phase_of[m]} and {ph['name']} — "
                f"a module belongs to one phase")
        phase_of[m] = ph["name"]

# 1. Every module is in exactly one phase, and every phase names real modules.
for name in sorted(modules):
    if name not in phase_of:
        bad(f"module {name} is in no phase — it would never be placed")
for ph in phases:
    for m in ph.get("modules") or []:
        if m not in modules:
            bad(f"phase {ph['name']} names module {m}, which is not declared")

# 2. NO DEPENDENCY POINTS FORWARD. A module may depend on one in its own phase
#    or any earlier one; an edge to a later phase is a module that cannot be
#    placed when its phase runs.
for name, m in sorted(modules.items()):
    here = phase_of.get(name)
    if here is None:
        continue
    for dep in m.get("dependsOn") or []:
        if dep not in modules:
            bad(f"module {name} dependsOn {dep}, which is not declared")
            continue
        there = phase_of.get(dep)
        if there is None:
            continue
        if index[there] > index[here]:
            bad(f"module {name} (phase {here}) dependsOn {dep} (phase {there}) — "
                f"the edge points FORWARD across a barrier and cannot be satisfied")

# 2b. THE PARTITION HAS NOT DRIFTED. Points 1 and 2 check that the graph
#     HOLDS; they cannot tell a deliberate reshuffle from a module that slid
#     into the wrong phase, because both still hold. So the partition is
#     declared here, and a module that moves has to move here too — which is
#     the moment someone reads why.
#
#     Taken from cirrus's own gate, which grew this check when the bootstrap
#     folded eight landings into five (43ca81b).
WAS = {
    "01-scaffold": ["ai-deployment", "ai-operations", "discovery-roots", "github-workflows", "rebrand-values", "root-gitignore", "root-intent", "root-kiox", "root-kiox-lock", "root-package-json", "root-pnpm-lock", "root-pnpm-workspace", "root-readme", "root-turbo", "tooling-eslint", "tooling-tsconfig", "tooling-wire"],
    "02-foundation": ["cli", "cli-tests", "contracts", "db", "db-tests", "shared", "testing"],
    "03-infrastructure": ["cloudflare-d1", "cloudflare-kv"],
    "04-mail": ["db-migrate", "mail-worker", "mail-worker-tests"],
    "05-api": ["site-api", "site-api-tests"],
    "06-site": ["web-site", "web-site-tests"],
    "07-domain": ["cloudflare-domain"],
    "08-docs": [],
}
# FOLDED, deliberately: a landing has a fixed cost — place, PR, merge, a
# convergence of its own — so a phase that bought nothing with its own landing
# lands with its neighbour. The data plane rides the packages' landing (no
# package reads D1, and Terraform builds no package), and the website rides the
# API's (the ordering survives in the DAG: web-site dependsOn site-api). The
# modules move WHOLE — nothing is lost, and nothing else may move with them.
# The numbering keeps its gaps so the surviving names stay the identities the
# task plane, the milestones and `--phase` use.
FOLDED = {"03-infrastructure": "02-foundation", "06-site": "05-api"}
# A phase that places nothing: its whole output is hook-rendered.
HOOK_ONLY = {"08-docs"}

for gone, into in FOLDED.items():
    if gone in index:
        bad(f"phase {gone} is declared again, but it is folded into {into}")
for name, was in WAS.items():
    if name in FOLDED:
        continue
    if name not in index:
        bad(f"phase {name} is gone, and it is not declared folded")
        continue
    now = sorted(by_name[name].get("modules") or [])
    folded_in = [m for gone, into in FOLDED.items() if into == name for m in WAS[gone]]
    want = sorted(was + folded_in)
    if now != want:
        moved_in = sorted(set(now) - set(want))
        moved_out = sorted(set(want) - set(now))
        bad(f"phase {name}'s modules drifted: "
            f"{'+' + ','.join(moved_in) if moved_in else ''}"
            f"{' ' if moved_in and moved_out else ''}"
            f"{'-' + ','.join(moved_out) if moved_out else ''} — "
            f"update WAS/FOLDED here and say why, or put it back")
for name in index:
    if name not in WAS:
        bad(f"phase {name} is new and undeclared — add it to WAS here")
for name in HOOK_ONLY:
    if name in index and (by_name[name].get("modules") or []):
        bad(f"phase {name} is declared hook-only but now places modules")

# 3. `requires.phases` is the execution order, stated. A phase may only require
#    one that runs before it, and the numbering must agree with the sequence.
for i, ph in enumerate(phases):
    for req in ((ph.get("requires") or {}).get("phases") or []):
        if req not in index:
            bad(f"phase {ph['name']} requires {req}, which is not a phase")
        elif index[req] >= i:
            bad(f"phase {ph['name']} (#{i}) requires {req} (#{index[req]}), which "
                f"does not run before it")

# 4. Every phase that deploys carries a task contract, and every contract file
#    on disk belongs to a phase. The contract is what the landing files under.
tasks_dir = root / "tasks"
contracts = {p.name.split(".")[0] for p in tasks_dir.glob("*.TaskContract.yaml")} if tasks_dir.exists() else set()
for ph in phases:
    name = ph["name"]
    if name not in contracts:
        bad(f"phase {name} has no tasks/{name}.TaskContract.yaml")
for c in sorted(contracts - set(order)):
    bad(f"tasks/{c}.TaskContract.yaml belongs to no phase — drop it or add the phase")

# 5. A contract's `affects` must name real components, and they must be
#    components the phase actually places. A phase that redeploys something it
#    did not place is a phase touching another phase's work.
def component_names(tree: pathlib.Path):
    out = {}
    for p in tree.rglob("component.yaml"):
        if "node_modules" in p.parts or ".git" in p.parts:
            continue
        doc = yaml.safe_load(p.read_text()) or {}
        nm = (doc.get("metadata") or {}).get("name")
        if nm:
            out[nm] = p.parent.relative_to(tree).as_posix()
    return out

comps = component_names(root)
placed_dir = {}
for name, m in modules.items():
    src = (m.get("from") or "").rstrip("/")
    if src:
        placed_dir.setdefault(phase_of.get(name), set()).add(src)

for ph in phases:
    name = ph["name"]
    f = tasks_dir / f"{name}.TaskContract.yaml"
    if not f.exists():
        continue
    spec = (yaml.safe_load(f.read_text()) or {}).get("spec") or {}
    for c in spec.get("affects") or []:
        if c not in comps:
            bad(f"tasks/{name}.TaskContract.yaml affects {c}, which no "
                f"component.yaml declares")
            continue
        if comps[c] not in placed_dir.get(name, set()):
            bad(f"tasks/{name}.TaskContract.yaml affects {c} ({comps[c]}), which "
                f"phase {name} does not place")

# 6. Every phase declares a narration and an estimate, because the console and
#    the CLI both render them and an empty one is a blank screen.
for ph in phases:
    for key in ("title", "expectedMinutes", "narrate"):
        if not ph.get(key):
            bad(f"phase {ph['name']} declares no {key}")
    for key in ("start", "await", "done", "failed"):
        if not (ph.get("narrate") or {}).get(key):
            bad(f"phase {ph['name']} has no narrate.{key}")

# 7. EVERY PHASE HAS A PAGE AND EVERY PAGE HAS A PHASE. What can drift out
#    from under a reader is `docs/phases/`: a page for a phase nobody runs, or
#    a phase nobody documented. A folded phase's page goes with it — its story
#    is told on the page of the phase it was folded into.
docs_dir = root / "docs" / "phases"
if docs_dir.exists():
    pages = {f.stem for f in docs_dir.glob("*.md")} - {"README", "TIMINGS"}
    for ph in phases:
        if ph["name"] not in pages:
            bad(f"phase {ph['name']} has no docs/phases/{ph['name']}.md")
    for page in sorted(pages - set(order)):
        bad(f"docs/phases/{page}.md documents no phase — fold it into the "
            f"page of the phase that absorbed it, or add the phase")

if problems:
    print("FAIL: the phase graph does not hold:", file=sys.stderr)
    for p in problems:
        print(f"  - {p}", file=sys.stderr)
    sys.exit(1)

print(f"   {len(phases)} phases in execution order: {' -> '.join(order)}")
print(f"   {len(modules)} modules, each in one phase, no edge pointing forward")
print(f"   {len(contracts)} task contracts, each affecting only its own phase's components")
print(f"   the partition matches WAS + FOLDED; every phase has a page")
PY

echo "phases.test.sh: ok"
