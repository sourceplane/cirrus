#!/usr/bin/env bash
# THE REBRAND'S SECRET REFS NAME THE PRODUCT'S WORKSPACE.
#
# A `secret://<workspace>/<project>/<env>/<KEY>` ref is verified by the
# platform's resolve against the run's own workspace — by slug, public id or
# ws_ ref. The blueprint hands rebrand.mjs the workspace as a ws_… id and no
# slug, and rebrand used to skip ws_ ids and fall back to the REPO name, so a
# product's refs named a workspace that does not exist:
#
#   Ref workspace "altocumulus" does not name this run's workspace
#
# This drives the real rebrand.mjs over a two-file tree and reads the refs back.
#
# The slugs below deliberately contain no baseline word. A slug that does — the
# workspace this was found in is literally `cirrus-test` — is rewritten AGAIN
# by the later repo-slug rule after it is substituted (`altocumulus-test`),
# which is its own defect; the ws_ id the blueprint passes is immune to it.
# Needs: node, git. No network.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
rebrand="$here/../tooling/rebrand/rebrand.mjs"

fail=0
check() { # name, values-json, want
  local name="$1" values="$2" want="$3" tmp got
  tmp="$(mktemp -d)"
  (
    cd "$tmp"
    git init -q
    mkdir -p apps/w .rebrand
    printf 'env:\n  TOKEN: secret://lumen/cirrus/stage/CLOUDFLARE_API_TOKEN\n' > apps/w/component.yaml
    printf '%s\n' "$values" > .rebrand/values.json
    git add -A
    node "$rebrand" --values .rebrand/values.json --allow-dirty >/dev/null
  )
  got="$(grep -o 'secret://[^ ]*' "$tmp/apps/w/component.yaml")"
  rm -rf "$tmp"
  if [ "$got" = "$want" ]; then
    echo "   ok  $name"
  else
    echo "   ✕  $name: got $got, want $want" >&2
    fail=1
  fi
}

echo "── rebrand: secret-ref workspace segment"
base='"reponame":"altocumulus","productname":"Altocumulus","productdomain":"altocumulus.dev"'
check "a ws_ id is the workspace segment" \
  "{$base,\"orunWorkspace\":\"ws_79BDXAZQ\"}" \
  "secret://ws_79BDXAZQ/altocumulus/stage/CLOUDFLARE_API_TOKEN"
check "an explicit slug wins" \
  "{$base,\"orunWorkspace\":\"ws_79BDXAZQ\",\"orunWorkspaceSlug\":\"acme-space\"}" \
  "secret://acme-space/altocumulus/stage/CLOUDFLARE_API_TOKEN"
check "a slug given as the workspace is kept" \
  "{$base,\"orunWorkspace\":\"acme-space\"}" \
  "secret://acme-space/altocumulus/stage/CLOUDFLARE_API_TOKEN"

[ "$fail" -eq 0 ] || exit 1
echo "rebrand.test.sh: ok"
