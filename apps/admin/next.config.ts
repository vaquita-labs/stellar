import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../'),
  // @vaquita/db and @vaquita/ui ship raw TS/TSX (exports ./src/index.ts), so
  // Next must transpile them for the admin app to import them.
  transpilePackages: ['@vaquita/db', '@vaquita/ui'],
};

export default nextConfig;
