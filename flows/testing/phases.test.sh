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
import pathlib, re, sys

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

# ── narration: authored here, printed from state (BE2) ────────────────────
#
# The plan put these checks in manifest.test.sh. They are here instead, and
# the reason is the same one that makes the checks worth having: that test
# compares `blueprint*.yaml` — the CONSOLE manifest — to the flows. Narration
# lives in `repo-blueprint.yaml`, which manifest.test.sh does not read, so
# putting the checks there would have meant reading a second file in a test
# named after the first.
#
# What orun's event stream actually carries, which is what a line may name.
META_AT = {
    # start/await/failed render against the phase's opening meta …
    "start": {"files", "expectedMinutes"},
    "await": {"files", "expectedMinutes"},
    "failed": {"files", "expectedMinutes"},
    # … and only `done` has run to a close, so only `done` knows how long it
    # took or what comes next. A `start` line naming `elapsed` would render
    # empty at the one moment it was written for.
    "done": {"files", "expectedMinutes", "elapsed", "next"},
}
STATE_WORDS = {"done", "failed", "complete", "completed", "succeeded", "skipped"}
PHASE_KEYS = {"name", "title"}
input_keys = set((bp.get("inputs") or {}).keys())

def strip_expressions(line):
    out, rest = [], line
    while True:
        i = rest.find("{{")
        if i < 0:
            out.append(rest)
            return "".join(out)
        out.append(rest[:i])
        j = rest.find("}}", i)
        if j < 0:
            return "".join(out)
        rest = rest[j + 2:]

def refs(line):
    """Every `.a.b` path inside an expression."""
    found = []
    for expr in re.findall(r"\{\{(.*?)\}\}", line, re.S):
        found += re.findall(r"\.([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)", expr)
    return found

def check_line(where, line, slot, hook_ids):
    # Rule 2: prose may describe the world, never assert the run's state.
    prose = strip_expressions(line).lower()
    for w in STATE_WORDS:
        if re.search(rf"\b{w}\b", prose):
            bad(f"{where} asserts {w!r} — `state` is the truth and narration is "
                f"the caption. Describe the world, not the run.")
    # Rule 3: every reference resolves against what the engine actually emits.
    for ref in refs(line):
        parts = ref.split(".")
        root = parts[0]
        if root == "phase":
            if len(parts) != 2 or parts[1] not in PHASE_KEYS:
                bad(f"{where} names .{ref}; a phase carries {sorted(PHASE_KEYS)}")
        elif root == "inputs":
            if len(parts) != 2 or parts[1] not in input_keys:
                bad(f"{where} names .{ref}, which is not a declared input")
        elif root == "meta":
            allowed = META_AT.get(slot, META_AT["start"])
            if len(parts) != 2 or parts[1] not in allowed:
                bad(f"{where} names .{ref}; the {slot} event carries "
                    f"{sorted(allowed)}")
        elif root == "hooks":
            if len(parts) < 2 or parts[1] not in hook_ids:
                bad(f"{where} names .{ref}; this phase has no hook {parts[1] if len(parts)>1 else '?'!r}")
        else:
            bad(f"{where} names .{ref}; narration may reference phase, inputs, "
                f"meta and hooks")

for p in phases:
    n = p.get("narrate") or {}
    ids = {h.get("id") for h in hooks_of(p)}
    for slot in ("start", "await", "done", "failed"):
        line = n.get(slot)
        if not line:
            bad(f"phase {p['name']} declares no narrate.{slot} — an operator sees "
                f"a generated line instead of the one this baseline meant")
            continue
        check_line(f"phase {p['name']} narrate.{slot}", line, slot, ids)

    # An `await` is the one place an operator is left waiting with nothing
    # happening on screen, so it is the one place a line is not optional.
    for h in ((p.get("hooks") or {}).get("await") or []):
        line = h.get("narrate")
        if not line:
            bad(f"phase {p['name']} await hook {h.get('id')} declares no narrate "
                f"— a wait with no words reads as a stalled build")
            continue
        check_line(f"phase {p['name']} hook {h.get('id')} narrate", line, "done", ids)

    for slot in ("pre", "post"):
        for h in ((p.get("hooks") or {}).get(slot) or []):
            if h.get("narrate"):
                check_line(f"phase {p['name']} hook {h.get('id')} narrate",
                           h["narrate"], "start", ids)

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
narrated = sum(len(p.get("narrate") or {}) for p in phases)
narrated += sum(1 for p in phases for h in hooks_of(p) if h.get("narrate"))
print(f"   {len(phases)} phases, {placed} modules, "
      f"{len(HOOK_ONLY)} hook-only — in execution order")
print(f"   {narrated} authored narration lines, every reference resolving")
PY

echo "phases.test.sh: ok"
