#!/usr/bin/env bash
# The phases in `repo-blueprint.yaml` must be the phases the bootstrap runs
# (saas-bootstrap-engine BE1).
#
# Before BE1 this could not be checked, because the two were different
# documents: `tooling/blueprint/split-phases.py` derived eight
# `flows/phases/*/blueprint.yaml` slices from this file and re-mapped their
# names to folders through a table inside the script. A mapping table in a
# generator is a fact nothing compares to anything, and it was wrong — this
# file declared `workspace` last while the folder it became, `01-scaffold`,
# runs first.
#
# THE PARTITION BELOW IS THE PRE-MIGRATION TRUTH. It is what the eight slices
# actually placed, read off them at the commit that deleted them. Its job is to
# fail if a later edit quietly moves a module between phases: the bootstrap's
# order is load-bearing (a worker cannot deploy before the D1 binding exists)
# and a module that drifts one phase earlier fails at deploy time, live, with
# nothing in this repo having looked wrong.
#
# bash + python3 + PyYAML. No network, no fakes, no credential.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"

echo "── repo-blueprint.yaml phases against what the bootstrap runs"
python3 - "$root" <<'PY'
import pathlib, sys

try:
    import yaml
except ImportError:
    sys.exit("PyYAML is required for the phase contract test (pip install pyyaml)")

root = pathlib.Path(sys.argv[1])
problems = []
def bad(m): problems.append(m)

bp = yaml.safe_load((root / "repo-blueprint.yaml").read_text())
phases = bp.get("phases") or []
if not phases:
    sys.exit("repo-blueprint.yaml declares no phases — this check has gone blind")

# What the eight slices placed, before they were deleted.
WAS = {
    "01-scaffold": ["ai-context", "github-workflows", "rebrand-values", "root-gitignore",
                    "root-intent", "root-kiox", "root-kiox-lock", "root-package-json",
                    "root-pnpm-lock", "root-pnpm-workspace", "root-readme", "root-turbo",
                    "tooling-eslint", "tooling-tsconfig", "tooling-wire", "vscode"],
    "02-foundation": ["cli", "contracts", "contracts-tests", "db", "db-tests",
                      "notifications-client", "notifications-client-tests", "policy-engine",
                      "policy-engine-tests", "sdk", "shared", "testing", "webhook-verifier"],
    "03-infrastructure": ["cloudflare-d1", "cloudflare-kv", "db-migrate"],
    "04-workers": ["admin-worker", "admin-worker-tests", "billing-worker", "billing-worker-tests",
                   "config-worker", "config-worker-tests", "events-worker", "events-worker-tests",
                   "identity-worker", "identity-worker-tests", "integrations-worker",
                   "integrations-worker-tests", "membership-worker", "membership-worker-tests",
                   "metering-worker", "metering-worker-tests", "notifications-worker",
                   "notifications-worker-tests", "policy-worker", "policy-worker-tests",
                   "projects-worker", "projects-worker-tests", "webhooks-worker",
                   "webhooks-worker-tests"],
    "05-edge": ["api-edge", "api-edge-tests"],
    "06-console": ["web-console-next", "web-console-next-tests"],
    "07-domain": ["cloudflare-domain"],
}
# Declared since BE1 and placing nothing: their work is hooks. `discovery-roots`
# is likewise new — the empty apps/infra/packages/tests roots orun's repo-scale
# gate requires, which the scaffold flow used to create with a mkdir.
ADDED = {"01-scaffold": ["discovery-roots"]}
HOOK_ONLY = {"04-workers-restore", "08-docs"}

by_name = {p["name"]: p for p in phases}
names = [p["name"] for p in phases]

# ── the order IS the execution order ──────────────────────────────────────
if names != sorted(names):
    bad(f"phases are not in execution order: {names}. The numbered name IS the "
        f"order; a phase out of sequence is a barrier in the wrong place.")

# ── the partition has not drifted ─────────────────────────────────────────
for name, was in WAS.items():
    if name not in by_name:
        bad(f"phase {name} is gone — the bootstrap ran it before BE1")
        continue
    now = sorted(by_name[name].get("modules") or [])
    want = sorted(was + ADDED.get(name, []))
    if now != want:
        moved_in = sorted(set(now) - set(want))
        moved_out = sorted(set(want) - set(now))
        bad(f"phase {name} no longer places what it placed: "
            f"gained {moved_in or '[]'}, lost {moved_out or '[]'}")

for name in HOOK_ONLY:
    if name not in by_name:
        bad(f"phase {name} is missing")
    elif by_name[name].get("modules"):
        bad(f"phase {name} places modules — it is declared as hooks only")

# ── every phase says what it is and what to budget ────────────────────────
for p in phases:
    for field in ("title", "expectedMinutes"):
        if not p.get(field):
            bad(f"phase {p['name']} declares no {field} — an operator reads both")
    if not (p.get("hooks") or {}):
        bad(f"phase {p['name']} declares no hooks — a phase that only places "
            f"files still has to land them")

# ── every contract a hook names exists ────────────────────────────────────
def hooks_of(p):
    h = p.get("hooks") or {}
    if isinstance(h, list):
        return list(h)
    return [x for slot in ("pre", "post", "await") for x in (h.get(slot) or [])]

for p in phases:
    for h in hooks_of(p) + [x for x in ((p.get("requires") or {}).get("probe") or [])]:
        rel = (h.get("with") or {}).get("contract")
        if rel and not (root / rel).exists():
            bad(f"phase {p['name']} hook {h.get('id')} names contract {rel}, "
                f"which does not exist")

# ── every phase FOLDER still under flows/ has a phase declared here ───────
# (BE4 deletes the folders; until then a folder with no phase is a flow that
# applies a blueprint slice that no longer exists.)
for d in sorted((root / "flows" / "phases").glob("*/workflow.yaml")):
    folder = d.parent.name
    if folder == "00-all":
        continue
    if folder not in by_name:
        bad(f"flows/phases/{folder} runs, and repo-blueprint.yaml declares no "
            f"phase by that name")

# ── what BE1 deleted stays deleted ────────────────────────────────────────
if list((root / "flows" / "phases").glob("*/blueprint.yaml")):
    bad("a flows/phases/*/blueprint.yaml is back — there is one blueprint")
if (root / "tooling" / "blueprint" / "split-phases.py").exists():
    bad("split-phases.py is back — orun's phase overlay refuses the cross-phase "
        "edge the splitter used to prune")

if problems:
    print("FAIL: the blueprint's phases and the bootstrap disagree:", file=sys.stderr)
    for p in problems:
        print(f"  - {p}", file=sys.stderr)
    sys.exit(1)

placed = sum(len(p.get("modules") or []) for p in phases)
print(f"   {len(phases)} phases, {placed} modules, "
      f"{len(HOOK_ONLY)} hook-only — in execution order")
PY

echo "phases.test.sh: ok"
