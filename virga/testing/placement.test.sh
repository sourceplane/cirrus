#!/usr/bin/env bash
# TIER 2 — THE TREE IS ACTUALLY PLACED, BRANDED, AND MADE TO ANSWER.
#
# Tiers 0 and 1 read the documents. They cannot catch a document the ENGINE
# refuses, and this baseline shipped two of those for two weeks:
#
#   ✕ hooks[12] (land): action orun.pr/land@v1 has no parameter "repo"
#     (it takes: base, body, branchSlug, checkTimeoutSeconds, draft, epic,
#      mergeMethod, rerunBudget, task, title, wait)
#   ✕ input "domain" has unknown type "bool"
#
# Both are hard refusals of the whole document — no Virga bootstrap could have
# started — and every offline gate was green the whole time, because every one
# of them parses `repo-blueprint.yaml` as YAML and none of them asks orun
# whether the actions and types in it exist. This file is that question.
#
# It does, in order:
#
#   1. place the whole blueprint from testing/fixtures/acme-blog.json, offline;
#   2. place it again PHASE BY PHASE and assert the two trees agree — the
#      phased bootstrap is the only way a product is really built, and
#      `--phase` has its own code path;
#   3. assert the BARRIER refuses a phase whose predecessor is not placed, and
#      names it (this is what `testing/phases.test.sh` checks on paper);
#   4. brand it as `01-scaffold`'s hook chain does, then `rebrand --verify`;
#   5. check the leak rules against the REAL FILES rather than a derivation;
#   6. run the product's own pipeline in the placed tree — install, wire from
#      the fixture, typecheck, lint, test, build. A baseline that places a
#      product which cannot build is not a baseline.
#
# Needs: orun >= v2.56 (--phase), node, pnpm, python3, git. NO network for the
# placement and no credential at any point: hooks are OFF, so nothing probes a
# provider, creates a repository or writes a secret. Step 6 does reach the npm
# registry, and is skipped with SKIP_PIPELINE=1.
#
# WHY THERE IS NO ASSERTION ON orun's OWN OUTPUT HERE. Cirrus's equivalent
# greps the placement log for `repo gate: validate + plan --dry-run passed` to
# prove the checks that ride inside `orun new` ran. That line is not in every
# orun — v2.75 does not print it — so the assertion fails on a newer engine
# while passing on the pinned one, which is a gate that reports the version
# rather than the tree. If a future orun grows a stable, documented way to ask
# "did you run the repo gate", assert on that instead.
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"

command -v orun >/dev/null || { echo "placement.test.sh needs orun on PATH" >&2; exit 1; }
command -v node >/dev/null || { echo "placement.test.sh needs node for the rebrand" >&2; exit 1; }

scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT
fails=0
fail() { echo "  ✕ $*" >&2; fails=$((fails + 1)); }

# The fixture is the source of inputs, so a new required input fails HERE.
sets=()
while IFS=$'\t' read -r k v; do sets+=( --set "$k=$v" ); done < <(
  python3 -I - "$root/testing/fixtures/acme-blog.json" <<'PY'
import json, sys
vals = json.load(open(sys.argv[1]))
for k, v in vals.items():
    if k.startswith("_"):
        continue
    print(f"{k}\t{'true' if v is True else 'false' if v is False else v}")
PY
)

# orun's repo-scale gate discovers apps/infra/packages/tests and a missing root
# is a hard failure, so they exist before the run — the same order 01-scaffold
# creates them in (the `discovery-roots` module places the .gitkeep files).
seed_tree() {
  mkdir -p "$1"/{apps,infra,packages,tests}
  for d in apps infra packages tests; do touch "$1/$d/.gitkeep"; done
}

# ── 1. the whole blueprint, in one go ──────────────────────────────────────
echo "── placing the whole blueprint (offline, hooks off, no credential)"
whole="$scratch/whole"
seed_tree "$whole"
if ! orun new --blueprint "$root/repo-blueprint.yaml" --out "$whole" "${sets[@]}" \
     > "$scratch/whole.log" 2>&1; then
  echo "FAIL: the engine refused the build document" >&2
  tail -20 "$scratch/whole.log" >&2
  exit 1
fi
whole_files="$(cd "$whole" && find . -type f -not -path "./.orun/*" | sort)"
echo "   $(echo "$whole_files" | wc -l | tr -d ' ') files placed"

# ── 2. the same thing, phase by phase ──────────────────────────────────────
# This is how a product is really built, and `--phase` is a different path
# through the engine. The two trees must agree exactly: a module that only one
# of them places is a module no bootstrap would ever place, or one placed twice.
echo "── placing it again, phase by phase"
seq_tree="$scratch/seq"
seed_tree "$seq_tree"
phases="$(python3 -I - "$root/repo-blueprint.yaml" <<'PY'
import sys, yaml
print(" ".join(p["name"] for p in yaml.safe_load(open(sys.argv[1]))["phases"]))
PY
)"
for ph in $phases; do
  if ! orun new --blueprint "$root/repo-blueprint.yaml" --out "$seq_tree" --phase "$ph" \
       "${sets[@]}" > "$scratch/seq-$ph.log" 2>&1; then
    fail "phase $ph was refused: $(tail -1 "$scratch/seq-$ph.log")"
  fi
done
seq_files="$(cd "$seq_tree" && find . -type f -not -path "./.orun/*" | sort)"
if [ "$whole_files" != "$seq_files" ]; then
  fail "the phased placement and the whole placement disagree:"
  diff <(echo "$whole_files") <(echo "$seq_files") | sed 's/^/        /' >&2
else
  echo "   the phased sequence places exactly the same tree"
fi

# ── 3. the barrier refuses, and names what is missing ──────────────────────
# `phases.test.sh` checks on paper that no `requires.phases` points forward.
# This checks the engine enforces it, which is the half paper cannot do.
echo "── the barrier, against an empty tree"
second="$(echo "$phases" | awk '{print $2}')"
third="$(echo "$phases" | awk '{print $3}')"
bare="$scratch/bare"
seed_tree "$bare"
if orun new --blueprint "$root/repo-blueprint.yaml" --out "$bare" --phase "$third" \
   "${sets[@]}" > "$scratch/bare.log" 2>&1; then
  fail "$third placed into an empty tree — the barrier is not enforced"
elif ! grep -q "$second" "$scratch/bare.log"; then
  fail "$third was refused but the message does not name $second: $(tail -1 "$scratch/bare.log")"
else
  echo "   $third is refused and told to run $second first"
fi

# ── 4. branding, where 01-scaffold puts it ─────────────────────────────────
echo "── branding the placed tree, then rebrand --verify"
(
  cd "$seq_tree" || exit 1
  git init -q . >/dev/null 2>&1
  git add -A
  node "$root/tooling/rebrand/rebrand.mjs" --values .rebrand/values.json --allow-dirty
  git add -A
  node "$root/tooling/rebrand/rebrand.mjs" --verify --values .rebrand/values.json
) > "$scratch/brand.log" 2>&1 || { fail "the rebrand chain failed"; tail -10 "$scratch/brand.log" >&2; }
grep -q "no baseline-identity leftovers" "$scratch/brand.log" \
  || fail "rebrand --verify did not report a clean tree"
name="$(python3 -I -c "import json,sys;print(json.load(open(sys.argv[1]))['name'])" "$seq_tree/package.json" 2>/dev/null)"
want="$(python3 -I -c "import json,sys;print(json.load(open(sys.argv[1]))['repoName'])" "$root/testing/fixtures/acme-blog.json")"
[ "$name" = "$want" ] || fail "after branding, package.json name is '$name', not '$want'"
echo "   branded as $want; no baseline-identity residue"

# ── 5. the leak rules, over the real files ─────────────────────────────────
# leak.test.sh runs these against what the modules DERIVE. Here they run
# against what is on disk, which is the thing an operator would actually ship.
echo "── what the product actually carries"
NEVER=(flows tasks testing hooks agents specs docs/phases BOOTSTRAP.md
       blueprint.yaml repo-blueprint.yaml tooling/rebrand tooling/bootstrap
       tooling/blueprint tooling/migrations)
for path in "${NEVER[@]}"; do
  if [ -e "$seq_tree/$path" ]; then
    fail "the product carries $path — that is this baseline's factory, not a product's"
  fi
done
ctx_count="$(find "$seq_tree/ai/context" -type f 2>/dev/null | wc -l | tr -d ' ')"
[ "$ctx_count" = "2" ] || fail "the product's ai/context has $ctx_count file(s), not the 2 declared"
if grep -rlEi "baseline-v[0-9]|cirrus|lumen" "$seq_tree/ai" 2>/dev/null | head -1 | grep -q .; then
  fail "baseline provenance leaked into the product's ai/: $(grep -rlEi 'baseline-v[0-9]|cirrus|lumen' "$seq_tree/ai" | head -3 | tr '\n' ' ')"
fi
echo "   none of the ${#NEVER[@]} factory paths; ai/context is exactly 2 files; no provenance prose"

# ── 6. the product's own pipeline, in the product ──────────────────────────
if [ "${SKIP_PIPELINE:-0}" = "1" ]; then
  echo "── the product's pipeline: SKIPPED (SKIP_PIPELINE=1)"
else
  echo "── the product's own pipeline, in the placed tree (this reaches the registry)"
  (
    cd "$seq_tree" || exit 1
    set -e
    pnpm install
    pnpm run wire:fixture
    pnpm typecheck
    pnpm lint
    pnpm test
    pnpm build
  ) > "$scratch/pipeline.log" 2>&1 \
    && echo "   install, wire:fixture, typecheck, lint, test, build — all green in the product" \
    || { fail "the placed product cannot build its own pipeline"; tail -25 "$scratch/pipeline.log" >&2; }
fi

[ "$fails" -eq 0 ] || { echo "placement.test.sh: $fails failure(s)" >&2; exit 1; }
echo "placement.test.sh: ok"
