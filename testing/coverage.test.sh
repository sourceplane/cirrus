#!/usr/bin/env bash
# EVERY COMPONENT THIS REPO SHIPS IS PLACED BY EXACTLY ONE PHASE
# (saas-bootstrap-engine BE5, Tier 0).
#
# `repo-blueprint.yaml` decides what a product is made of. A component that no
# module names is not a component a product gets — and nothing would say so.
# The failure is quiet and late: the fork builds, its CI goes green, and the
# missing piece surfaces when somebody looks for a worker that was never
# copied.
#
# orun already enforces the other half — every MODULE belongs to exactly one
# phase, and a module naming an unknown module is a parse error. What it cannot
# know is what this repository contains, because a blueprint declares what to
# place and not what exists. That is this file's job.
#
# bash + python3 + PyYAML. No network, no orun, no credential.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"

echo "── every component against the blueprint that places it"
python3 - "$root" <<'PY'
import pathlib, sys

try:
    import yaml
except ImportError:
    sys.exit("PyYAML is required for the coverage gate (pip install pyyaml)")

root = pathlib.Path(sys.argv[1])
problems = []
def bad(m): problems.append(m)

# A component directory this repository deliberately keeps to itself. Declared
# with its reason rather than skipped by a pattern: "tests/*" would also hide
# the thirteen component test suites a product genuinely needs, and the next
# baseline-only directory should have to be argued for in a diff.
# EMPTY SINCE BE4, and that is the milestone's own result rather than an
# oversight. The one entry was `tests/flows`, the bootstrap's contract suite,
# exempt because it tested `flows/` — which no product carried. `flows/` is
# gone, that suite moved to `testing/` (which is not a component at all, and
# so is not a component this gate can miss), and the exemption's subject no
# longer exists.
#
# The map stays rather than the mechanism being deleted with its last entry:
# the check below refuses an exemption whose directory is absent, so a stale
# entry cannot linger — and the next baseline-only directory should still have
# to be argued for in a diff rather than discovered as a re-added feature.
BASELINE_ONLY: dict[str, str] = {
    "testing/rehearsal": (
        "BE6b: the factory testing itself. A component that bootstraps a whole "
        "throwaway product from the PUBLISHED baseline, asserts it came up, and "
        "destroys it — so it is about this repository rather than about any "
        "product, and a product that carried it would rehearse building itself. "
        "It is also the first entry in this map since BE4 emptied it, which is "
        "the diff this comment asked for: `testing/` is already on both leak "
        "gates' NEVER lists, and the rehearsal keeps its own intent so a "
        "product does not even inherit a mention of the composition it needs."
    ),
}

bp = yaml.safe_load((root / "repo-blueprint.yaml").read_text())

# Where each module takes its content from, and which phase places it.
placed_by = {}
for m in bp.get("modules") or []:
    src = (m.get("from") or "").rstrip("/")
    if src:
        placed_by.setdefault(src, []).append(m["name"])
phase_of = {n: ph["name"] for ph in (bp.get("phases") or []) for n in ph["modules"]}

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

# A directory named baseline-only must actually BE one, or the exemption is
# protecting nothing and will outlive the thing it was written for.
for comp in BASELINE_ONLY:
    if not (root / comp).exists():
        bad(f"{comp} is declared baseline-only and does not exist — drop the entry")

if problems:
    print("FAIL: the blueprint and this repository disagree about what a product is:",
          file=sys.stderr)
    for p in problems:
        print(f"  - {p}", file=sys.stderr)
    sys.exit(1)

shipped = len(components) - len(BASELINE_ONLY)
print(f"   {shipped} of {len(components)} components placed, "
      f"{len(BASELINE_ONLY)} baseline-only by declaration")
PY

echo "coverage.test.sh: ok"
