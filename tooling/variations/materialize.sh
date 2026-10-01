#!/usr/bin/env bash
# Materialize a user-scoped product repo from this baseline + a variation overlay.
#
#   tooling/variations/materialize.sh <variation> <out-dir>
#       [--workspace <ws_…|slug>] [--no-rebrand] [--verify]
#
# ─── WHAT A PRODUCT IS MADE OF IS NOT DECIDED HERE ─────────────────────────
#
# This script used to carry its own answer: an EXCLUDE_RE naming the baseline
# machinery that must not ship. It was written against a tree with `flows/` in
# it, and when the bootstrap moved into `repo-blueprint.yaml` the regex went on
# excluding a directory that no longer existed and said nothing about what
# replaced it — `tasks/`, `testing/`, `docs/phases/`, `hooks/`,
# `tooling/migrations/`, and the three factory workflows (`baseline.yml`,
# `tag.yml`, `rehearsal.yml`), which run `testing/*.sh` and would have been red
# on a product's first pull request.
#
# The blueprint already decides this. Its modules ARE the product's files, and
# `testing/leak.test.sh` fails the baseline's own pull request when they are
# not. So this asks the same question the leak gate asks, of the same engine:
#
#     orun new --blueprint repo-blueprint.yaml --status --json --out <empty>
#
# Against an empty directory every file a phase places is "missing", and the
# union of those lists is the product. Nothing here can drift from the
# blueprint, because there is nothing here to drift.
#
# What it does, in order:
#   1. derives the product's file set from `repo-blueprint.yaml` and copies
#      exactly those tracked files into <out-dir>;
#   2. lays `variations/_common/overlay/` and `variations/<variation>/overlay/`
#      on top (added + replaced files, authored in baseline naming), and removes
#      every path listed in `variations/<variation>/delete.txt`;
#   3. refuses if the result carries any factory path — an overlay can add a
#      product's own files, not the baseline's machinery;
#   4. writes `.rebrand/values.json` from `variations/<variation>/values.json`
#      and runs the baseline's rebrand, then re-tenants `intent.yaml` and gates
#      the orun lanes behind `vars.ORUN_CI` (see below);
#   5. `git init` + one commit recording the baseline commit it was born from.
#
# --workspace names the product's Orun Cloud workspace. Without it `intent.yaml`
# gets a placeholder that fails loudly: a product that inherits the baseline's
# workspace id claims another tenant on every remote op.
#
# --verify additionally runs install, the offline wrangler fixtures, build,
# typecheck, lint and tests in <out-dir>.
#
# Needs: orun (new enough for `orun new --status`), python3 (stdlib only),
# node, pnpm, git. Portable to BSD userland: no GNU-only flags.
set -euo pipefail

usage() { sed -n '2,6p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2; exit 2; }

[ $# -ge 2 ] || usage
name="$1"; out="$2"; shift 2
rebrand=true
verify=false
workspace=""
while [ $# -gt 0 ]; do
  case "$1" in
    --no-rebrand) rebrand=false; shift ;;
    --verify) verify=true; shift ;;
    --workspace) workspace="${2:?--workspace needs a ws_… id or a slug}"; shift 2 ;;
    *) echo "materialize: unknown flag $1" >&2; exit 2 ;;
  esac
done

for tool in orun python3 node pnpm git; do
  command -v "$tool" >/dev/null || { echo "materialize: needs $tool on PATH" >&2; exit 1; }
done
orun new --help 2>&1 | grep -q -- '--status' || {
  echo "materialize: this orun ($(orun version 2>&1 | head -1)) has no \`orun new --status\`;" >&2
  echo "             the blueprint cannot be asked what it places. Use the version ci.yml pins, or newer." >&2
  exit 1
}

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
baseline="$(cd "$here/../.." && pwd)"
vdir="$baseline/variations/$name"
[ -f "$vdir/values.json" ] || { echo "materialize: $vdir/values.json not found" >&2; exit 1; }
[ -f "$baseline/repo-blueprint.yaml" ] || { echo "materialize: $baseline/repo-blueprint.yaml not found" >&2; exit 1; }

mkdir -p "$out"
if [ -n "$(ls -A "$out" 2>/dev/null)" ]; then
  echo "materialize: $out is not empty" >&2; exit 1
fi
out="$(cd "$out" && pwd)"

scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT

# ── 1. the product's file set, from the blueprint ──────────────────────────
# The variation's values.json IS a set of blueprint inputs, so a key the
# blueprint does not declare is refused by orun here rather than ignored.
# `domain` is forced on: 07-domain is conditional, and its component is a
# product file whether or not the first deploy attaches a domain.
echo "materialize: asking the blueprint what a product is made of"
sets=()
while IFS=$'\t' read -r k v; do sets+=( --set "$k=$v" ); done < <(
  python3 - "$vdir/values.json" <<'PY'
import json, sys
vals = json.load(open(sys.argv[1]))
vals["domain"] = True
for k, v in vals.items():
    if k.startswith("_"):
        continue
    print(f"{k}\t{'true' if v is True else 'false' if v is False else v}")
PY
)
orun new --blueprint "$baseline/repo-blueprint.yaml" --status --json \
  --out "$scratch/empty" "${sets[@]}" > "$scratch/status.json"

git -C "$baseline" ls-files > "$scratch/tracked"
python3 - "$scratch/status.json" "$scratch/tracked" "$baseline" "$out" <<'PY'
import json, os, shutil, sys

status, tracked_file, baseline, out = sys.argv[1:5]
placed = sorted({f for ph in json.load(open(status))["phases"] for f in (ph.get("missing") or [])})
if len(placed) < 500:
    sys.exit(f"materialize: only {len(placed)} files derived — the blueprint did not describe a product")
tracked = set(open(tracked_file).read().split("\n"))

copied = made = 0
unknown = []
for rel in placed:
    dst = os.path.join(out, rel)
    if rel in tracked:
        os.makedirs(os.path.dirname(dst) or out, exist_ok=True)
        shutil.copy2(os.path.join(baseline, rel), dst, follow_symlinks=False)
        copied += 1
    elif rel == ".rebrand/values.json":
        pass  # written below, from the variation's own values
    elif os.path.basename(rel) == ".gitkeep":
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        open(dst, "a").close()
        made += 1
    else:
        unknown.append(rel)
if unknown:
    # A templated file this script has no rule for. Guessing its content would
    # be the regex again, one file at a time.
    sys.exit("materialize: the blueprint places files this baseline does not track "
             "and this script cannot render:\n  " + "\n  ".join(unknown))
print(f"materialize: {copied} baseline files copied, {made} placeholder(s) created → {out}")
PY

# ── 2. the overlay ─────────────────────────────────────────────────────────
for ov in "$baseline/variations/_common/overlay" "$vdir/overlay"; do
  if [ -d "$ov" ]; then
    echo "materialize: applying overlay ${ov#"$baseline"/}"
    cp -R "$ov/." "$out/"
  fi
done
if [ -f "$vdir/delete.txt" ]; then
  while IFS= read -r p; do
    [ -z "$p" ] && continue
    rm -rf "${out:?}/${p}"
  done < "$vdir/delete.txt"
fi

# ── 3. the factory never ships ─────────────────────────────────────────────
# The blueprint keeps the factory out of step 1. This keeps an overlay from
# putting it back, and is the list `testing/leak.test.sh` holds the blueprint
# to plus the three workflows the blueprint ignores.
leaks="$(cd "$out" && find . -type f | sed 's#^\./##' | grep -E \
  '^(flows/|agents/|tasks/|testing/|hooks/|variations/|docs/phases/|tooling/(rebrand|bootstrap|blueprint|variations|migrations|fork)/|BOOTSTRAP\.md$|FORKING\.md$|blueprint\.yaml$|repo-blueprint\.yaml$|\.github/workflows/(baseline|tag|rehearsal)\.yml$)' || true)"
if [ -n "$leaks" ]; then
  echo "materialize: the product would carry the factory:" >&2
  printf '%s\n' "$leaks" | sed 's/^/  - /' >&2
  exit 1
fi

# The commit a product is born from is a claim someone will check. A baseline
# with uncommitted changes is not that commit, and the trailer says so.
baseline_sha="$(git -C "$baseline" rev-parse HEAD)"
if [ -n "$(git -C "$baseline" status --porcelain --untracked-files=no)" ]; then
  echo "materialize: the baseline has uncommitted changes — recording ${baseline_sha}-dirty" >&2
  baseline_sha="${baseline_sha}-dirty"
fi
mkdir -p "$out/.rebrand"
# The workspace travels in values.json, where rebrand.mjs reads it: the secret
# refs' workspace segment is rewritten from it.
python3 - "$vdir/values.json" "$out/.rebrand/values.json" "$workspace" <<'PY'
import json, sys
src, dst, ws = sys.argv[1:4]
vals = json.load(open(src))
if ws:
    vals["orunWorkspace"] = ws
json.dump(vals, open(dst, "w"), indent=2)
open(dst, "a").write("\n")
PY

cd "$out"
git init -q -b main
git add -A
if $rebrand; then
  echo "materialize: rebranding"
  node "$baseline/tooling/rebrand/rebrand.mjs" --values .rebrand/values.json --allow-dirty
  # Re-tenant. rebrand.mjs treats the orun state backend as org-owned and
  # leaves `workspace:` alone, so without this the product claims the
  # baseline's tenant. Same rewrite the blueprint's `orun-workspace` hook makes.
  python3 - "${workspace:-ws_CHANGE_ME}" <<'PY'
import re, sys
ws = sys.argv[1]
before = open("intent.yaml").read()
after, n = re.subn(r"(?m)^(\s*workspace:\s*).*$", lambda m: m.group(1) + ws, before, count=1)
if n != 1:
    sys.exit("materialize: no `workspace:` line in intent.yaml — refusing to guess")
open("intent.yaml", "w").write(after)
print("materialize: intent.yaml workspace -> " + ws
      + ("" if ws != "ws_CHANGE_ME" else "  (placeholder: set it before enabling the orun lanes)"))
PY
  git add -A
  node "$baseline/tooling/rebrand/rebrand.mjs" --verify --values .rebrand/values.json
fi

# The orun lanes (ci.yml) exchange an OIDC token for the product's workspace on
# every push. A bootstrapped product has a workspace before it has a commit; a
# materialized one does not, and its first push would die at the exchange with
# `not_found`. Gate the lanes behind a repository variable the owner sets once
# the repo is allow-listed: `gh variable set ORUN_CI --body true`.
python3 - <<'PY'
import re, sys
p = ".github/workflows/ci.yml"
s = open(p).read()
if "vars.ORUN_CI" in s:
    sys.exit(0)
gated, n = re.subn(r"(?m)^(  plan:\n)(    runs-on:)", r"\1    if: ${{ vars.ORUN_CI == 'true' }}\n\2", s, count=1)
if n != 1:
    sys.exit("materialize: could not find the `plan` job in ci.yml to gate behind vars.ORUN_CI — "
             "the workflow changed shape; refusing to ship lanes that are red before the repo is attached")
open(p, "w").write(gated)
print("materialize: ci.yml `plan` gated behind vars.ORUN_CI")
PY

# New workspace packages (the variation's worker and its test package) change
# the lockfile: regenerate it from the store so `--frozen-lockfile` holds in CI.
pnpm install --lockfile-only --prefer-offline >/dev/null
git add -A
git -c user.name="materialize" -c user.email="noreply@sourceplane.ai" commit -q \
  -m "$(node -e 'const v=JSON.parse(require("fs").readFileSync(".rebrand/values.json","utf8"));console.log(v.productname)'): born from the Cirrus baseline

Baseline: sourceplane/cirrus@${baseline_sha}
Variation: ${name}"
echo "materialize: repo ready at $out ($(git rev-parse --short HEAD))"

if $verify; then
  echo "materialize: verifying (install, wire fixtures, build, typecheck, lint, test)"
  pnpm install --frozen-lockfile --prefer-offline
  pnpm -r --if-present run wire:fixture
  # Build, typecheck, then test as separate turbo invocations: mixing them in
  # one run lets ts-jest race a sibling package's emit (observed as spurious
  # "Cannot find module '@saas/db'" failures under concurrency).
  pnpm exec turbo run build --concurrency=4
  pnpm exec turbo run typecheck --concurrency=4
  pnpm exec turbo run lint --concurrency=4
  # Concurrency 2: every suite is ts-jest (a TypeScript program per worker) and
  # a wider fan-out oversubscribes the machine into spurious resolution errors.
  pnpm exec turbo run test --concurrency=2
fi
