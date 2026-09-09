// OpenNext Cloudflare adapter config. The site binds no R2/KV/D1 of its own —
// every dynamic thing it needs comes from site-api — so the in-memory
// defaults keep the build hermetic.
import { defineCloudflareConfig } from "@opennextjs/cloudflare/config";

export default defineCloudflareConfig({});
