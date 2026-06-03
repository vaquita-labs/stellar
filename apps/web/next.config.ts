import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
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
