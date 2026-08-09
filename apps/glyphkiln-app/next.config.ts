import type { NextConfig } from "next";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const applicationRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(applicationRoot, "../..");

const nextConfig: NextConfig = {
  experimental: {
    useTypeScriptCli: true,
  },
  headers() {
    return Promise.resolve([
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
          },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ]);
  },
  output: "standalone",
  outputFileTracingRoot: repositoryRoot,
  serverExternalPackages: ["@glyphkiln/core", "@resvg/resvg-js"],
};

export default nextConfig;
