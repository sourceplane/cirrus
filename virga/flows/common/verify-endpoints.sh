#!/usr/bin/env bash
# Probe the product's deployed endpoints, derived from .rebrand/values.json.
# Pass the surfaces to check: "api" (site-api /health) and/or "site".
#
#   flows/common/verify-endpoints.sh <out> <api|site> [api|site…]
set -euo pipefail

out="${1:?product repo dir}"
shift
[ "$#" -gt 0 ] || { echo "verify-endpoints: name at least one surface (api|site)" >&2; exit 1; }

vals="$out/.rebrand/values.json"
repo="$(python3 -c "import json;print(json.load(open('$vals'))['repoName'])")"
sub="$(python3 -c "import json;print(json.load(open('$vals'))['workersDevSubdomain'])")"

urls=()
for surface in "$@"; do
  case "$surface" in
    api)
      urls+=("https://${repo}-site-api-stage.${sub}.workers.dev/health")
      urls+=("https://${repo}-site-api-prod.${sub}.workers.dev/health")
      ;;
    site)
      urls+=("https://${repo}-web-site-stage.${sub}.workers.dev")
      urls+=("https://${repo}-web-site-prod.${sub}.workers.dev")
      ;;
    *) echo "verify-endpoints: unknown surface $surface" >&2; exit 2 ;;
  esac
done

ok=0; fail=0
for url in "${urls[@]}"; do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$url" || echo 000)"
  if [ "$code" -ge 200 ] && [ "$code" -lt 500 ]; then
    echo "✓ $url → $code"; ok=$((ok+1))
  else
    echo "✕ $url → $code" >&2; fail=$((fail+1))
  fi
done
[ "$fail" -eq 0 ] || { echo "$fail endpoint(s) unhealthy" >&2; exit 1; }
echo "verify-endpoints: $ok healthy"
