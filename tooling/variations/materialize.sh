#!/usr/bin/env bash
# Materialize a user-scoped product repo from this baseline + a variation overlay.
#
#   tooling/variations/materialize.sh <variation> <out-dir> [--no-rebrand] [--verify]
#
# What it does, in order:
#   1. copies the baseline's PRODUCT-ONLY tracked files into <out-dir> (none of
#      the baseline machinery: flows, agents, blueprints, rebrand tooling,
#      baseline specs/epics, working notes);
#   2. lays `variations/_common/overlay/` and `variations/<variation>/overlay/`
#      on top (added + replaced files, authored in baseline naming), and removes
#      every path listed in `variations/<variation>/delete.txt`;
#   3. writes `.rebrand/values.json` from `variations/<variation>/values.json`
#      and runs the baseline's rebrand renamer so every instance-identity literal
#      (repo slug, product name, worker names, domain) becomes the product's;
#   4. `git init` + one commit recording the baseline commit it was born from.
#
# --verify additionally runs `pnpm install`, renders the offline wrangler
# fixtures, and runs typecheck + tests in <out-dir>.
#
# The result is a standalone repo ready for `git remote add origin … && git push`.
set -euo pipefail

name="${1:?variation name (folder under variations/)}"
out="${2:?output directory}"
shift 2
rebrand=true
verify=false
for a in "$@"; do
  case "$a" in
    --no-rebrand) rebrand=false ;;
    --verify) verify=true ;;
    *) echo "materialize: unknown flag $a" >&2; exit 2 ;;
  esac
done

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
baseline="$(cd "$here/../.." && pwd)"
vdir="$baseline/variations/$name"
[ -f "$vdir/values.json" ] || { echo "materialize: $vdir/values.json not found" >&2; exit 1; }

# Baseline machinery that never ships in a product.
EXCLUDE_RE='^(flows/|agents/|variations/|tooling/variations/|tooling/rebrand/|tooling/blueprint/|tooling/bootstrap/|specs/epics/|specs/variations/|specs/_archive/|specs/roadmap\.md$|ai/tasks/|ai/reports/|ai/proposals/|ai/state\.json$|ai/deferred\.md$|ai/waiting_for_input\.md$|ai/context/fork-from-baseline\.md$|BOOTSTRAP\.md$|blueprint\.yaml$|repo-blueprint\.yaml$|FORKING\.md$)'

mkdir -p "$out"
if [ -n "$(ls -A "$out" 2>/dev/null)" ]; then
  echo "materialize: $out is not empty" >&2; exit 1
fi

echo "materialize: copying product-only baseline files → $out"
git -C "$baseline" ls-files | grep -Ev "$EXCLUDE_RE" > "$out/.materialize-files"
tar -C "$baseline" -cf - -T "$out/.materialize-files" | tar -C "$out" -xf -
rm -f "$out/.materialize-files"

for ov in "$baseline/variations/_common/overlay" "$vdir/overlay"; do
  if [ -d "$ov" ]; then
    echo "materialize: applying overlay ${ov#$baseline/}"
    cp -R "$ov/." "$out/"
  fi
done
if [ -f "$vdir/delete.txt" ]; then
  while IFS= read -r p; do
    [ -z "$p" ] && continue
    rm -rf "$out/${p}"
  done < "$vdir/delete.txt"
fi

baseline_sha="$(git -C "$baseline" rev-parse HEAD)"
mkdir -p "$out/.rebrand"
cp "$vdir/values.json" "$out/.rebrand/values.json"

cd "$out"
git init -q -b main
git add -A
if $rebrand; then
  echo "materialize: rebranding"
  node "$baseline/tooling/rebrand/rebrand.mjs" --values .rebrand/values.json --allow-dirty
  # The Orun Cloud workspace is per product: the baseline's id must not leak.
  sed -i -E 's/^(\s*workspace:) .*/\1 ws_CHANGE_ME   # your Orun Cloud workspace (id or slug)/' intent.yaml
fi
# New workspace packages (the variation's worker and its test package) change
# the lockfile: regenerate it from the store so `--frozen-lockfile` holds in CI.
pnpm install --lockfile-only --prefer-offline >/dev/null
git add -A
git -c user.name="materialize" -c user.email="noreply@sourceplane.ai" commit -q \
  -m "$(node -e 'console.log(JSON.parse(require("fs").readFileSync(".rebrand/values.json","utf8")).productName)'): born from the Cirrus baseline

Baseline: sourceplane/cirrus@${baseline_sha}
Variation: ${name}"
echo "materialize: repo ready at $out ($(git rev-parse --short HEAD))"

if $verify; then
  echo "materialize: verifying (install, wire fixtures, typecheck, test)"
  pnpm install --frozen-lockfile --prefer-offline
  pnpm -r --if-present run wire:fixture
  # Build, typecheck, then test as separate turbo invocations: mixing them in
  # one run lets ts-jest race a sibling package's emit (observed as spurious
  # "Cannot find module '@saas/db'" failures under concurrency).
  pnpm exec turbo run build --concurrency=4
  pnpm exec turbo run typecheck --concurrency=4
  # Concurrency 2: every suite is ts-jest (a TypeScript program per worker) and
  # a wider fan-out oversubscribes the machine into spurious resolution errors.
  pnpm exec turbo run test --concurrency=2
fi
