# Templates

The **worked example** in [examples/platforms/](examples/platforms/) is the
`vercel/platforms` migration as it was proven (see
[proof-set.md](proof-set.md#1-vercelplatforms--proven)). Copy from it first.
Manifests there are named `*.example.yaml` so that Cirrus's own discovery and
contract tests ignore them. Rename them to `component.yaml` / `intent.yaml` in
the target.

| Need | Copy from |
|---|---|
| Root workspace | `examples/platforms/{package.json,pnpm-workspace.yaml,turbo.json,gitignore.example}` |
| `intent.yaml` | `examples/platforms/intent.example.yaml`. Set `metadata.name`, `execution.state.workspace`, and `repo:` in each env's `parameterDefaults.terraform`. Keep the stack-tectonic tag Cirrus pins. |
| `kiox.yaml`, `kiox.lock`, `.github/workflows/ci.yml`, `tooling/wire/render.mjs` | Cirrus repo root, verbatim (the composition calls `tooling/wire/render.mjs` from `workspaceDir`) |
| Next app component (needs bindings or secrets) | `examples/platforms/apps/web/component.example.yaml` (type `cloudflare-worker-turbo`) |
| Next app component (stateless, no bindings) | Cirrus `apps/web-console-next/component.yaml` (type `cloudflare-workers-assets-turbo`) |
| Wrangler template + fixture | `examples/platforms/apps/web/{wrangler.template.jsonc,wiring.fixture.json}` |
| OpenNext config | `examples/platforms/apps/web/{open-next.config.ts,next.config.ts}`, then pick caches per the feature-map VC-ISR table |
| KV infra | `examples/platforms/infra/terraform/cloudflare-kv/` |
| D1 infra + migrations | Cirrus `infra/terraform/cloudflare-d1/`, `infra/db-migrate/component.yaml`, `packages/db/src/{runner,manifest.ts,migrations/000_control}` |

## Which composition type? (Gate G3, verified against stack-tectonic 0.18.1)

| Type | Schema accepts wiring + `runtimeSecrets`? | Use for |
|---|---|---|
| `cloudflare-workers-assets-turbo` | **No.** `additionalProperties: false`; `orun plan` rejects `wranglerTemplate`/`wiring*` | Stateless frontends that talk to an API over HTTP (the Cirrus console) |
| `cloudflare-worker-turbo` | **Yes:** `wranglerTemplate`, `wiringComponents`, `wiringEnvs`, `wiringFixture`, `runtimeSecrets`, `migrationCommand` | Any OpenNext app that binds KV/D1/R2/DO or holds secrets. An OpenNext build *is* a Worker plus an assets directory, and `wrangler deploy` uploads both. |
| `terraform` | `secretOutputs: "WIRING_<X>=wiring"` publishes the wiring document | `infra/terraform/cloudflare-{d1,kv,r2}` |
| `db-migrate` | `path:` to the migrations dir | D1 schema |

The `cloudflare-worker-turbo` verify lane runs: setup → install →
`verify-worker-structure` (fails on a 32-hex `"id"` in the template) →
`wire-fixture` → `buildCommand` → `typecheckCommand` → `wrangler deploy
--dry-run --env <env>`. The deploy lane adds `wire-live`, `preDeployCommand`,
`migrationCommand`, deploy, `runtimeSecrets` push, and `smokeCommand`. Read
the schema of the pinned catalog yourself:

```bash
orun compositions <type>                       # summary
ls ~/.orun/cache/compositions/*/compositions/<type>/   # schema.yaml, jobs/, profiles/
```

## Component with runtime secrets (Stripe, Auth, OAuth)

```yaml
  secretEnv:                       # wiring: hard requirement
    WIRING_CLOUDFLARE_D1_STAGE: "secret://<ns>/<repo>/stage/WIRING_CLOUDFLARE_D1"
    WIRING_CLOUDFLARE_D1_PROD:  "secret://<ns>/<repo>/prod/WIRING_CLOUDFLARE_D1"
  optionalSecretEnv:               # wire-now-seed-later: unseeded keys are skipped
    STRIPE_SECRET_KEY:     "secret://<ns>/<repo>/{{ .environment }}/STRIPE_SECRET_KEY"
    STRIPE_WEBHOOK_SECRET: "secret://<ns>/<repo>/{{ .environment }}/STRIPE_WEBHOOK_SECRET"
    AUTH_SECRET:           "secret://<ns>/<repo>/{{ .environment }}/AUTH_SECRET"
  parameters:
    runtimeSecrets: "STRIPE_SECRET_KEY,STRIPE_WEBHOOK_SECRET,AUTH_SECRET"
```

Seed values with `orun secrets set`. Never commit `.dev.vars`.

## R2 bucket (terraform, add to a `cloudflare-r2` root)

```hcl
resource "cloudflare_r2_bucket" "uploads" {
  account_id = var.cloudflare_account_id
  name       = "${var.namespacePrefix}${var.repo}-uploads-${var.environment}"
}
output "wiring" {
  value = jsonencode({ uploads_bucket_name = cloudflare_r2_bucket.uploads.name })
}
```

Template binding:
`"r2_buckets": [{ "binding": "UPLOADS", "bucket_name": "@@wiring(cloudflare-r2/stage:uploads_bucket_name)@@" }]`.
Copy the Cirrus `adopt.tf` pattern so that a re-bootstrap adopts the existing
bucket rather than colliding with it.

## Cron worker (VC-CRON)

`apps/cron/src/index.ts`:

```ts
// Maps each Cron Trigger to the route Vercel used to call, preserving the
// CRON_SECRET bearer contract so the route handlers do not change.
const ROUTES: Record<string, string> = {
  "0 * * * *": "/api/cron/usage",       // from vercel.json
  "*/5 * * * *": "/api/cron/domains",
};

export default {
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    const path = ROUTES[event.cron];
    if (!path) throw new Error(`no route for cron ${event.cron}`);
    ctx.waitUntil(
      env.APP.fetch(`https://app${path}`, {
        headers: { authorization: `Bearer ${env.CRON_SECRET}` },
      }).then((r) => { if (!r.ok) throw new Error(`${path} → ${r.status}`); }),
    );
  },
} satisfies ExportedHandler<Env>;
```

Its wrangler template declares `"triggers": { "crons": [...] }` and
`"services": [{ "binding": "APP", "service": "<app>-web-<env>" }]` per env.
Its component is `cloudflare-worker-turbo` with `dependsOn: [{ component: web }]`.

## `docs/migration/decisions.md` skeleton

```markdown
# Migration decisions — <repo>

| # | Gate | Decision | Why |
|---|---|---|---|
| D1 | G0 | next pinned to <x> with @opennextjs/cloudflare <y> | tested pair, not just the peer range |
| D2 | G3 | web is cloudflare-worker-turbo | binds KV/DO |
| D3 | G4 | kvIncrementalCache + doShardedTagCache + doQueue | revalidatePath in actions.ts |

## Exceptions (waived by the residue gate)
<!-- exception: VC-XXX — reason — exit by <phase/date> -->
```
