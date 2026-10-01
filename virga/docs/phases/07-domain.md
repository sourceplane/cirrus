# 07-domain — the custom domain

**Lands:** `infra/terraform/cloudflare-domain`.

**OPTIONAL.** The phase carries `when: inputs.domain`, default `false`,
because it needs the Cloudflare zone to ALREADY EXIST in the connected
account. Terraform will not create the zone, and a run that assumes it fails
four phases in with a provider error about a name it cannot resolve.

Turn it on with `--set domain=true` once the zone is there.

## Verified by

The convergence run after the merge. There is no probe: DNS and certificate
issuance are not on the run's clock, and a probe that fails because a
certificate is still being issued would be a false negative. `08-docs`
re-probes everything once, later.
