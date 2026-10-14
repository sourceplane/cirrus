import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace-source packages export `./src/*.ts` with `./*.js` specifiers;
  // pair them for webpack and run them through SWC.
  transpilePackages: ["@site/contracts"],
  webpack(config) {
    config.resolve = config.resolve || {};
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias || {}),
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
  // Required by @opennextjs/cloudflare, which bundles `.next/standalone/**`.
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: true },
  env: {
    NEXT_PUBLIC_DEPLOY_ENV: process.env.NEXT_PUBLIC_DEPLOY_ENV ?? "",
    NEXT_PUBLIC_SITE_API_URL: process.env.NEXT_PUBLIC_SITE_API_URL ?? "",
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? "",
  },
};

export default nextConfig;
