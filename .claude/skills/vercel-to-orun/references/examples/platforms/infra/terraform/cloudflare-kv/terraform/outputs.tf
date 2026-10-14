# --- Wiring manifest (via orun secrets) ---
# Published by the terraform composition's wire-secrets step as
# WIRING_CLOUDFLARE_KV (secretOutputs in component.yaml); the web component's
# deploy lane reads it back to render @@wiring(cloudflare-kv/<env>:<key>)@@.

output "wiring" {
  description = "Wiring document for deploy-time binding resolution (pushed to orun secrets)"
  value = jsonencode({
    tenants_kv_id        = cloudflare_workers_kv_namespace.tenants.id
    next_inc_cache_kv_id = cloudflare_workers_kv_namespace.next_inc_cache.id
  })
}

output "tenants_kv_id" {
  value = cloudflare_workers_kv_namespace.tenants.id
}

output "next_inc_cache_kv_id" {
  value = cloudflare_workers_kv_namespace.next_inc_cache.id
}
