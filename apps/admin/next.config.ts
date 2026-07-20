import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../'),
  // @vaquita/db, @vaquita/shared and @vaquita/ui ship raw TS/TSX (exports
  // ./src/index.ts), so Next must transpile them for the admin app to import
  // them. @vaquita/shared is only imported via its subpath export
  // (services/profile/rules), which pulls in zod and nothing server-specific.
  transpilePackages: ['@vaquita/db', '@vaquita/shared', '@vaquita/ui'],
};

export default nextConfig;
