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
  default = "platforms"
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

# --- KV namespaces ---
#
# tenants:        subdomain -> {emoji, createdAt}; replaces the Upstash Redis
#                 store the Vercel template used (feature-map VC-UPSTASH).
# next_inc_cache: OpenNext incremental cache (feature-map VC-ISR / Gate G4).
#
# Titles carry var.repo and the env so they are unique per account; Workers
# resolve both by ID through the wiring secret, never by title.

locals {
  tenants_title        = "${var.namespacePrefix}${var.repo}-tenants-${var.environment}"
  next_inc_cache_title = "${var.namespacePrefix}${var.repo}-next-inc-cache-${var.environment}"
}

resource "cloudflare_workers_kv_namespace" "tenants" {
  account_id = var.cloudflare_account_id
  title      = local.tenants_title
}

resource "cloudflare_workers_kv_namespace" "next_inc_cache" {
  account_id = var.cloudflare_account_id
  title      = local.next_inc_cache_title
}
