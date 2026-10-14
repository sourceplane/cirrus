#!/usr/bin/env bash
# THE MANIFEST MUST STATE WHAT THE BLUEPRINT DOES.
#
# `blueprint.yaml` is the contract the platform's bootstrap door reads and the
# console renders screen for screen. A manifest that drifts is a console that
# LIES — showing an operator secrets that will not be created, or a programme
# whose milestones the build never opens.
#
# Every list below is compared to `repo-blueprint.yaml`, the document that
# actually does the thing, rather than to a copy of itself.
#
# The gate is deliberately ONE-DIRECTIONAL where it has to be: the build may
# declare more inputs than the card (defaults exist for a reason), but it may
# not REQUIRE one the card does not supply — that is a build that dies on its
# first step with `input "x" is required`.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

python3 - "$root" <<'PY'
import pathlib, sys, yaml

root = pathlib.Path(sys.argv[1])
problems = []
def bad(m): problems.append(m)

card = yaml.safe_load((root / "blueprint.yaml").read_text())
spec = card.get("spec") or {}
bp = yaml.safe_load((root / "repo-blueprint.yaml").read_text())

# ── 1. the build document the card names must be the one that exists ───────
named = ((spec.get("bootstrap") or {}).get("blueprint") or "")
if not named:
    bad("spec.bootstrap.blueprint is unset — a runner fetching this repo at its "
        "pinned tag would have nothing to run")
elif not (root / named).exists():
    bad(f"spec.bootstrap.blueprint names {named}, which does not exist")
elif named != "repo-blueprint.yaml":
    bad(f"spec.bootstrap.blueprint names {named}; this baseline's build document "
        f"is repo-blueprint.yaml")

# The retired layer must not be referred to. `umbrella` and `agentBrief` named
# files under flows/, and flows/ is gone.
for dead in ("umbrella", "agentBrief"):
    if (spec.get("bootstrap") or {}).get(dead):
        bad(f"spec.bootstrap.{dead} refers to the retired flows/ layer — the "
            f"build document is the only entry point now")

# ── 2. inputs: every REQUIRED build input is on the card ───────────────────
bp_inputs = bp.get("inputs") or {}
card_keys = {i["key"] for i in (spec.get("inputs") or [])}
for key, decl in sorted(bp_inputs.items()):
    if (decl or {}).get("required") and key not in card_keys:
        bad(f"repo-blueprint.yaml requires input {key!r} and the card does not "
            f"declare it — the build would die on its first step")
for key in sorted(card_keys - set(bp_inputs)):
    bad(f"the card asks for input {key!r}, which the build does not declare — "
        f"the operator would fill in a field nothing reads")

# Every card input carries the rule its value is checked against before
# Continue. A field with no pattern, no type and no default is a free-text box.
for i in spec.get("inputs") or []:
    if not any(k in i for k in ("pattern", "type", "derive", "from", "default")):
        bad(f"card input {i['key']!r} has no pattern, type, default, `from` or "
            f"`derive` — nothing validates what the operator types")

# ── 3. secrets: exactly the keys the build's reconcile hooks mint ──────────
def reconcile_keys(doc):
    out = {}
    def walk(node):
        if isinstance(node, dict):
            if node.get("uses") == "orun.integrations/reconcile@v1":
                w = node.get("with") or {}
                for k in w.get("keys") or []:
                    out[k] = w.get("template")
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)
    walk(doc)
    return out

minted = reconcile_keys(bp)
declared = {s["key"]: s.get("template") for s in (spec.get("secrets") or [])}
for k in sorted(set(minted) - set(declared)):
    bad(f"the build mints secret {k} and the card does not declare it — the "
        f"console would not tell the operator it is created")
for k in sorted(set(declared) - set(minted)):
    bad(f"the card declares secret {k} and no reconcile hook mints it — the "
        f"console would promise a secret that never appears")
for k in sorted(set(minted) & set(declared)):
    if minted[k] != declared[k]:
        bad(f"secret {k}: the card says template {declared[k]!r}, the build mints "
            f"it with {minted[k]!r}")

# ── 4. programme: the milestones the build opens, in the build's order ─────
prog = spec.get("programme") or {}
bp_phases = [ph["name"] for ph in (bp.get("phases") or [])]
card_ms = [m["name"] for m in (prog.get("milestones") or [])]
if card_ms != bp_phases:
    bad(f"the card's programme milestones {card_ms} are not the build's phases "
        f"{bp_phases}, in order")

# A conditional phase's milestone must say so, or the console shows work that
# a default run never does.
conditional = {ph["name"] for ph in (bp.get("phases") or []) if ph.get("when")}
for m in prog.get("milestones") or []:
    if m["name"] in conditional and not m.get("when"):
        bad(f"phase {m['name']} is conditional in the build and the card's "
            f"milestone does not say so")
    if m.get("when") and m["name"] not in conditional:
        bad(f"the card marks milestone {m['name']} conditional and the build runs "
            f"it unconditionally")

slug = prog.get("epicSlug")
bp_slug = ((bp_inputs.get("epicSlug") or {}).get("default"))
if slug != bp_slug:
    bad(f"the card's epicSlug {slug!r} is not the build's default {bp_slug!r}")

# ── 5. the estimate is the sum of the phases' own ──────────────────────────
# A card minute-count nobody derived is a promise the phases never made. The
# optional phase is excluded, because the default run does not run it.
total = sum(ph.get("expectedMinutes") or 0 for ph in (bp.get("phases") or [])
            if not ph.get("when"))
card_total = (spec.get("bootstrap") or {}).get("expectedMinutes")
if card_total != total:
    bad(f"the card promises {card_total} minutes; the phases that a default run "
        f"executes add up to {total}")

# ── 6. verify URLs use input keys the card declares ───────────────────────
import re
for url in ((spec.get("verify") or {}).get("urls") or []):
    for ref in re.findall(r"\{([A-Za-z0-9_]+)\}", url):
        if ref == "env":
            continue
        if ref not in card_keys:
            bad(f"verify url {url} interpolates {{{ref}}}, which is not a card input")

if problems:
    print("FAIL: the manifest does not describe the build:", file=sys.stderr)
    for p in problems:
        print(f"  - {p}", file=sys.stderr)
    sys.exit(1)

print(f"   build document: {named}")
print(f"   {len(card_keys)} card inputs cover every required build input")
print(f"   {len(declared)} secrets, key and template, match the reconcile hooks")
print(f"   {len(card_ms)} milestones in the build's phase order; {total} minutes, summed from the phases")
PY

echo "manifest.test.sh: ok"
