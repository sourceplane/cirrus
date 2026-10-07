import { getCloudflareContext } from '@opennextjs/cloudflare';

// Tenant store on Workers KV (was Upstash Redis — feature-map VC-UPSTASH).
// KV is eventually consistent across locations (~60s); a subdomain created in
// one region may 404 briefly elsewhere. Acceptable for this app: creation
// redirects to the new subdomain from the same location that wrote it.
function tenants(): KVNamespace {
  return getCloudflareContext().env.TENANTS;
}

export const kv = {
  async get<T>(key: string): Promise<T | null> {
    return tenants().get<T>(key, 'json');
  },
  async set(key: string, value: unknown): Promise<void> {
    await tenants().put(key, JSON.stringify(value));
  },
  async del(key: string): Promise<void> {
    await tenants().delete(key);
  },
  // Replaces redis.keys(prefix*) + mget: KV lists by prefix, 1000 keys per page.
  async listByPrefix<T>(prefix: string): Promise<Array<{ key: string; value: T | null }>> {
    const keys: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await tenants().list({ prefix, cursor });
      keys.push(...page.keys.map((k) => k.name));
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
    return Promise.all(keys.map(async (key) => ({ key, value: await kv.get<T>(key) })));
  }
};
