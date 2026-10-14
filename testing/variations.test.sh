#!/usr/bin/env bash
# THE VARIATIONS ARE HELD TO THE BLUEPRINT, NOT TO A LIST OF THEIR OWN.
#
# `variations/<name>/` is a product as an overlay: the files it adds or changes
# plus the identity to rebrand to. `tooling/variations/materialize.sh` builds
# the product by asking `repo-blueprint.yaml` what a product is made of and
# laying the overlay on top.
#
# It did not always ask. It carried an EXCLUDE_RE written against a tree with
# `flows/` in it, and when the bootstrap moved into the blueprint the regex kept
# excluding a directory that no longer existed and copied everything that
# replaced it — `tasks/`, `testing/`, `docs/phases/`, `hooks/`, and the three
# factory workflows — into five products. Nothing failed, because nothing
# compared the two. This is the comparison.
#
# What it checks, offline:
#   1. materialize.sh still derives the file set from the blueprint, and has
#      not grown a path list of its own;
#   2. every variation's values.json is a set of inputs the blueprint declares,
#      with every required input present — the same contract
#      tests/fixtures/acme.json is held to;
#   3. no overlay carries a factory path: an overlay adds a product's files,
#      not the baseline's machinery;
#   4. every overlay component is accounted for — it replaces a component a
#      module places, or it is new and the baseline has no directory there.
#      `coverage.test.sh` exempts overlays by rule and points here.
#   5. intent.yaml keeps orun's catalog out of `variations/`, so an overlay
#      component is never planned as this repository's own.
#
# It does NOT materialize a product: that needs orun, pnpm and minutes.
# `materialize.sh <name> <out> --verify` is that test, and it asserts (3)
# again on the tree it actually built.
# Needs: python3 + PyYAML. No network.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"

python3 - "$root" <<'PY'
import json, pathlib, re, sys
import yaml

root = pathlib.Path(sys.argv[1])
problems = []
def bad(m): problems.append(m)

vroot = root / "variations"
names = sorted(p.name for p in vroot.iterdir() if p.is_dir() and not p.name.startswith("_"))
if not names:
    sys.exit("no variation under variations/ — this check has gone blind")

# ── 1. the script asks the blueprint ───────────────────────────────────────
script = (root / "tooling/variations/materialize.sh").read_text()
code = "\n".join(l for l in script.splitlines() if not l.lstrip().startswith("#"))
if not re.search(r"orun new --blueprint .*repo-blueprint\.yaml.* --status", code):
    bad("materialize.sh no longer derives the product's files from "
        "`orun new --blueprint repo-blueprint.yaml --status`")
if "EXCLUDE_RE" in code or "git ls-files | grep -Ev" in code:
    bad("materialize.sh selects product files with a pattern of its own again — "
        "the blueprint's modules are the product, and nothing else is")

# ── 2. the identity is a set of blueprint inputs ───────────────────────────
bp = yaml.safe_load((root / "repo-blueprint.yaml").read_text())
inputs = bp["inputs"]
required = {k for k, v in inputs.items() if v.get("required")}
for name in names:
    vf = vroot / name / "values.json"
    if not vf.exists():
        bad(f"variations/{name} has no values.json")
        continue
    vals = {k: v for k, v in json.loads(vf.read_text()).items() if not k.startswith("_")}
    for k in sorted(set(vals) - set(inputs)):
        bad(f"variations/{name}/values.json: `{k}` is not an input repo-blueprint.yaml "
            f"declares — orun refuses it, and rebrand.mjs would ignore it")
    for k in sorted(required - set(vals)):
        bad(f"variations/{name}/values.json: required input `{k}` is missing")
    if vals.get("reponame") != name:
        bad(f"variations/{name}/values.json: reponame is {vals.get('reponame')!r}, "
            f"and the folder says {name!r}")

# ── 3. no overlay carries the factory ──────────────────────────────────────
# leak.test.sh's NEVER list, plus the workflows the blueprint's `ignore` keeps
# out of a product. `specs/` is deliberately absent: a variation plans its own
# epics there, and they are the product's.
FACTORY = re.compile(
    r"^(flows/|agents/|tasks/|testing/|hooks/|variations/|docs/phases/|"
    r"tooling/(rebrand|bootstrap|blueprint|variations|migrations|fork)/|"
    r"BOOTSTRAP\.md$|FORKING\.md$|blueprint\.yaml$|repo-blueprint\.yaml$|"
    r"\.github/workflows/(baseline|tag|rehearsal)\.yml$)"
)
placed_dirs = {(m.get("from") or "").rstrip("/") for m in bp["modules"] if m.get("from")}
overlay_components = 0
for name in ["_common", *names]:
    ov = vroot / name / "overlay"
    if not ov.is_dir():
        if name != "_common":
            bad(f"variations/{name} has no overlay/")
        continue
    for f in sorted(p for p in ov.rglob("*") if p.is_file()):
        rel = f.relative_to(ov).as_posix()
        if FACTORY.search(rel):
            bad(f"variations/{name}/overlay/{rel} is the factory, not a product file")
        # ── 4. every overlay component is accounted for ───────────────────
        if f.name == "component.yaml":
            overlay_components += 1
            comp = f.parent.relative_to(ov).as_posix()
            if comp in placed_dirs:
                continue  # the variation's copy of a component a module places
            if (root / comp).exists():
                bad(f"variations/{name}/overlay/{comp} replaces a baseline directory "
                    f"no module places — the product would get the overlay's half only")

# ── 5. orun does not mistake an overlay for this repository ────────────────
# orun's catalog resolver walks the WHOLE repository for component.yaml, not
# only `discovery.roots`. Without an exclude, every overlay component is
# planned and deployed as this repository's own, and the five overlay copies
# of apps/api-edge share a name with the real one, which fails a cold
# `orun plan --changed` outright:
#
#     failed to compute changed components: objcatalog: catalog
#     "catalogs/current": objectstore: object not found
#
# That is this repository's own ci.yml `plan` lane, on every pull request and
# on the convergence run after merge.
intent = yaml.safe_load((root / "intent.yaml").read_text())
excluded = (((intent.get("catalog") or {}).get("discovery") or {}).get("exclude")) or []
if overlay_components and "variations" not in excluded:
    bad("intent.yaml does not list `variations` under catalog.discovery.exclude — "
        f"orun would catalog {overlay_components} overlay components as this "
        "repository's, and the duplicate names fail `orun plan --changed`")

if problems:
    print("FAIL: the variations and the blueprint disagree:", file=sys.stderr)
    for p in problems:
        print(f"  - {p}", file=sys.stderr)
    sys.exit(1)

print(f"   {len(names)} variations: {', '.join(names)}")
print(f"   every values.json is blueprint inputs, {len(required)} required present")
print(f"   {overlay_components} overlay components accounted for; no factory path in any overlay")
PY

echo "variations.test.sh: ok"
