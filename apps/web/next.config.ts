import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  env: {
    // Cache-buster for the immutable OG/share card images: every `next build`
    // stamps a fresh value (or the commit SHA when CI provides one), so a
    // redesigned card gets a new URL on deploy without anyone remembering to
    // bump a manual version. Inlined into the client bundle at build time.
    NEXT_PUBLIC_CARD_VERSION: process.env.GIT_SHA?.slice(0, 8) ?? Date.now().toString(36),
  },
  outputFileTracingRoot: path.join(__dirname, '../../'),
  // @vaquita/ui ships raw TSX (exports ./src/index.ts), so Next must transpile it.
  transpilePackages: ['@vaquita/ui'],
  images: {
    // Profile avatars live on MinIO under a *.vaquita.fi subdomain. next/image
    // fetches them server-side, so an http source is fine — the browser only
    // ever sees the optimized https /_next/image URL, which avoids mixed-content
    // blocking. http stays allowed until the MinIO domain is served over TLS.
    remotePatterns: [
      { protocol: 'https', hostname: '**.vaquita.fi' },
      { protocol: 'http', hostname: '**.vaquita.fi' },
    ],
  },
};

export default nextConfig;
