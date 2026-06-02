import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../'),
  // @vaquita/db ships raw TS/ESM (exports ./src/index.ts), so Next must
  // transpile it for the admin API route handlers to import `prisma`.
  transpilePackages: ['@vaquita/db'],
  eslint: {
    // ignoreDuringBuilds: true,
  },
};

export default nextConfig;
