terraform {
  required_version = ">= 1.15.0"

  # State lives on the platform: the runner exports TF_HTTP_* per job, so this
  # block stays empty — no bucket, no role, no workspaces.
  backend "http" {}

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.52"
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
  default = "cloudflare-domain"
}

variable "stackName" {
  type    = string
  default = "cloudflare-domain"
}

variable "terraformDir" {
  type    = string
  default = "terraform"
}

variable "terraformVersion" {
  type    = string
  default = "1.15.3"
}

# --- Domain variables (from intent.yaml env and component parameters) ---

variable "baseDomain" {
  type        = string
  default     = "virga.site"
  description = "Root domain to manage (from BASE_DOMAIN env or component parameter)"
}

variable "zoneMode" {
  type        = string
  default     = "existing"
  description = "Zone management mode: 'existing' adopts the zone, 'managed' creates it"
  validation {
    condition     = contains(["existing", "managed"], var.zoneMode)
    error_message = "zoneMode must be 'existing' or 'managed'."
  }
}

variable "workerNamePrefix" {
  type        = string
  default     = "virga-web-site"
  description = "Worker name prefix for the site; the service name is {prefix}-{environment}"
}

variable "SITE_CUSTOM_DOMAIN" {
  type        = string
  default     = ""
  description = "Custom domain for the site (per-environment, via TF_VAR from intent.yaml)"
}

locals {
  site_custom_domain = var.SITE_CUSTOM_DOMAIN
  worker_name        = "${var.workerNamePrefix}-${var.environment}"
  has_custom_domain  = local.site_custom_domain != ""
}

# --- Zone ---
#
# `existing` adopts a zone already delegated to Cloudflare (the normal case:
# the registrar points at Cloudflare's nameservers). `managed` creates it,
# which only helps when the account owns the registration.

data "cloudflare_zone" "existing" {
  count = var.zoneMode == "existing" ? 1 : 0
  name  = var.baseDomain
}

resource "cloudflare_zone" "managed" {
  count      = var.zoneMode == "managed" ? 1 : 0
  account_id = var.cloudflare_account_id
  zone       = var.baseDomain
  plan       = "free"
}

locals {
  zone_id     = var.zoneMode == "existing" ? data.cloudflare_zone.existing[0].id : cloudflare_zone.managed[0].id
  zone_status = var.zoneMode == "existing" ? data.cloudflare_zone.existing[0].status : cloudflare_zone.managed[0].status
}

# --- Worker custom domain ---
#
# Attaches `SITE_CUSTOM_DOMAIN` to the environment's site Worker. The resource
# is `cloudflare_workers_domain` on the v4 provider line pinned above; it is
# renamed to `cloudflare_workers_custom_domain` in v5, and the v5 provider does
# not implement the cross-type state move — a provider bump is therefore a
# two-phase migration (drop the state entry with `removed { lifecycle {
# destroy = false } }`, apply, then re-adopt with an `import {}` block), not a
# one-line edit.

resource "cloudflare_workers_domain" "site" {
  count = local.has_custom_domain ? 1 : 0

  account_id  = var.cloudflare_account_id
  zone_id     = local.zone_id
  hostname    = local.site_custom_domain
  service     = local.worker_name
  environment = "production"
}

# --- Outputs (non-secret) ---

output "zone_id" {
  description = "Cloudflare zone ID for the base domain"
  value       = local.zone_id
}

output "zone_status" {
  description = "Cloudflare zone status (active once the nameservers are delegated)"
  value       = local.zone_status
}

output "site_custom_domain" {
  description = "Custom hostname attached to this environment's site Worker (empty when unset)"
  value       = local.site_custom_domain
}
