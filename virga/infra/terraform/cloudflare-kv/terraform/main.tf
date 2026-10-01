terraform {
  required_version = ">= 1.15.0"

  # State lives on the platform (SB1): the runner exports TF_HTTP_* per job, so
  # this block stays empty — no S3 bucket, no AWS role, no workspaces.
  backend "http" {}

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.30"
    }
    external = {
      source  = "hashicorp/external"
      version = "~> 2.3"
    }
  }
}

# --- Providers ---

# Authenticates via the CLOUDFLARE_API_TOKEN env var (provider-native): the
# token is an orun-managed secret resolved into the job env at run time, so it
# never transits Terraform variables.
provider "cloudflare" {}

# --- Variables (standard Orun parameters) ---

variable "cloudflare_account_id" {
  type        = string
  sensitive   = true
  default     = ""
  description = "Cloudflare account ID (from CLOUDFLARE_ACCOUNT_ID env var)"
}

variable "orgName" {
  type    = string
  default = "sourceplane"
}

variable "owner" {
  type    = string
  default = "sourceplane"
}

variable "repo" {
  type    = string
  default = "virga"
}

variable "namespace" {
  type    = string
  default = "sourceplane"
}

variable "namespacePrefix" {
  type    = string
  default = ""
}

variable "lane" {
  type    = string
  default = "verify"
}

variable "environment" {
  type    = string
  default = "stage"
}

variable "component" {
  type    = string
  default = "cloudflare-kv"
}

variable "stackName" {
  type    = string
  default = "cloudflare-kv"
}

variable "terraformDir" {
  type    = string
  default = "terraform"
}

variable "terraformVersion" {
  type    = string
  default = "1.15.3"
}

# --- KV namespace for the site-api rate limiter ---
#
# Backs the per-fingerprint token buckets (`rl:v1:*`) and the per-address
# confirmation-mail throttle (`mail:confirm:*`). Entries are TTL'd per PUT by
# the Worker; KV namespaces themselves have no Terraform-side TTL knob.

locals {
  # Brand-namespaced with var.repo: KV namespace titles are unique per account
  # and a product may share an account with this baseline, so an un-branded
  # title would collide (error 10014, "a namespace with this account ID and
  # title already exists"). The Worker resolves the namespace by ID from the
  # wiring secret, so the title is free to change.
  rate_limit_namespace_title = "${var.namespacePrefix}${var.repo}-site-api-rate-limit-${var.environment}"
}

resource "cloudflare_workers_kv_namespace" "rate_limit" {
  account_id = var.cloudflare_account_id
  title      = local.rate_limit_namespace_title
}

# --- Wiring manifest (BF5, via orun secrets) ---
# The consumable outputs are published by the composition's wire-secrets step
# as the WIRING_CLOUDFLARE_KV secret on the project/{{env}} rung; the site-api
# deploy reads it back as WIRING_CLOUDFLARE_KV_<ENV> secretEnv and renders the
# committed @@wiring(...)@@ token from it.

output "wiring" {
  description = "Wiring document for downstream deploy-time binding resolution (pushed to orun secrets)"
  value = jsonencode({
    kv_namespace_id    = cloudflare_workers_kv_namespace.rate_limit.id
    kv_namespace_title = cloudflare_workers_kv_namespace.rate_limit.title
  })
}

# --- Outputs (non-secret) ---

output "kv_namespace_id" {
  description = "Cloudflare Workers KV namespace ID for the site-api rate limiter"
  value       = cloudflare_workers_kv_namespace.rate_limit.id
}

output "kv_namespace_title" {
  description = "Cloudflare Workers KV namespace title (human-readable identifier)"
  value       = cloudflare_workers_kv_namespace.rate_limit.title
}
