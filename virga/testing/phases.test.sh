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

if problems:
    print("FAIL: the phase graph does not hold:", file=sys.stderr)
    for p in problems:
        print(f"  - {p}", file=sys.stderr)
    sys.exit(1)

print(f"   {len(phases)} phases in execution order: {' -> '.join(order)}")
print(f"   {len(modules)} modules, each in one phase, no edge pointing forward")
print(f"   {len(contracts)} task contracts, each affecting only its own phase's components")
PY

echo "phases.test.sh: ok"
