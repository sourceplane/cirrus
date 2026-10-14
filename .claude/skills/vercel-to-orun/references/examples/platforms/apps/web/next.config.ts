import path from 'node:path';
import type { NextConfig } from 'next';
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

const nextConfig: NextConfig = {
  // Required by @opennextjs/cloudflare, which bundles .next/standalone/** into
  // the Worker. Set explicitly because the build script runs `next build`
  // itself and then `opennextjs-cloudflare build --skipNextBuild`.
  output: 'standalone',
  // Trace from the monorepo root so workspace deps land in the standalone tree.
  outputFileTracingRoot: path.join(__dirname, '../..')
};

export default nextConfig;

// Lets `next dev` read Cloudflare bindings (TENANTS etc.) through
// getCloudflareContext(), backed by miniflare.
initOpenNextCloudflareForDev();
