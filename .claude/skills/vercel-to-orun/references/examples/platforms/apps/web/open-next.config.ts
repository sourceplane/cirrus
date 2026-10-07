// OpenNext Cloudflare adapter config (Gate G4): the app calls revalidatePath()
// after deleting a tenant, so it needs a persistent incremental cache, a tag
// cache, and a revalidation queue. KV + Durable Objects keep this archetype
// (A2:kv-backed) free of D1/R2; the bindings are declared in
// wrangler.template.jsonc.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import kvIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache";
import doShardedTagCache from "@opennextjs/cloudflare/overrides/tag-cache/do-sharded-tag-cache";
import doQueue from "@opennextjs/cloudflare/overrides/queue/do-queue";

export default defineCloudflareConfig({
  incrementalCache: kvIncrementalCache,
  tagCache: doShardedTagCache({ baseShardSize: 12 }),
  queue: doQueue,
});
